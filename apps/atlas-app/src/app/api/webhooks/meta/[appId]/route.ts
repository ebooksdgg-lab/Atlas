import { NextRequest, NextResponse } from "next/server"
import { createHmac, timingSafeEqual } from "crypto"
import { db } from "@/lib/db"
import { numbers, eventLog, metaApps } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { decrypt } from "@/lib/crypto"
import { sendQualityAlert } from "@/lib/alerts"

// ─── GET — Meta webhook verification ─────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get("hub.mode")
  const token = searchParams.get("hub.verify_token")
  const challenge = searchParams.get("hub.challenge")

  if (
    mode === "subscribe" &&
    token === (process.env.META_VERIFY_TOKEN ?? "") &&
    challenge
  ) {
    return new NextResponse(challenge, { status: 200 })
  }

  return NextResponse.json({ error: "Verification failed" }, { status: 403 })
}

// ─── POST — Meta webhook events ───────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
) {
  const { appId } = await params
  const rawBody = await req.text()

  // Look up app to get its secret for signature validation
  const [app] = await db
    .select()
    .from(metaApps)
    .where(eq(metaApps.id, appId))
    .limit(1)

  if (app) {
    const signature = req.headers.get("x-hub-signature-256") ?? ""
    try {
      const secret = decrypt(app.appSecretEncrypted)
      const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`
      const sigBuf = Buffer.from(signature)
      const expBuf = Buffer.from(expected)
      if (
        sigBuf.length !== expBuf.length ||
        !timingSafeEqual(sigBuf, expBuf)
      ) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
      }
    } catch (e) {
      console.error("[webhook/meta] Signature check error:", e)
      return NextResponse.json({ error: "Signature check failed" }, { status: 500 })
    }
  }

  let body: MetaWebhookBody
  try {
    body = JSON.parse(rawBody) as MetaWebhookBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (body.object !== "whatsapp_business_account") {
    return NextResponse.json({ ok: true })
  }

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field === "phone_quality_score") {
        await handleQualityChange(change.value)
      }
    }
  }

  return NextResponse.json({ ok: true })
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleQualityChange(value: MetaQualityValue): Promise<void> {
  const phoneNumberId = value.phone_number
  if (!phoneNumberId) return

  const rawQuality = value.quality_score?.toUpperCase() ?? "UNKNOWN"
  const newRating = normalizeQuality(rawQuality)

  const [number] = await db
    .select()
    .from(numbers)
    .where(eq(numbers.phoneNumberId, phoneNumberId))
    .limit(1)

  if (!number) return

  const prev = number.qualityRating
  if (prev === newRating) return

  const now = new Date()
  await db
    .update(numbers)
    .set({ qualityRating: newRating, updatedAt: now })
    .where(eq(numbers.id, number.id))

  await db.insert(eventLog).values({
    numberId: number.id,
    eventType: "quality_dropped",
    data: { from: prev, to: newRating, metaEvent: value.event },
  })

  if (shouldAlert(prev, newRating)) {
    await sendQualityAlert({
      eventType: "quality_dropped",
      numberId: number.id,
      phoneNumber: number.phoneNumber,
      productSlug: number.productSlug,
      productName: number.productName,
      evolutionInstanceName: number.evolutionInstanceName,
      data: { from: prev, to: newRating },
    })
  }
}

function shouldAlert(from: string, to: string): boolean {
  const rank: Record<string, number> = { GREEN: 2, YELLOW: 1, RED: 0, UNKNOWN: -1 }
  return (rank[to] ?? -1) < (rank[from] ?? -1)
}

function normalizeQuality(raw: string): "GREEN" | "YELLOW" | "RED" | "UNKNOWN" {
  if (raw === "GREEN" || raw === "HIGH") return "GREEN"
  if (raw === "YELLOW" || raw === "MEDIUM") return "YELLOW"
  if (raw === "RED" || raw === "LOW") return "RED"
  return "UNKNOWN"
}

// ─── Meta webhook types ───────────────────────────────────────────────────────

interface MetaWebhookBody {
  object: string
  entry?: Array<{
    id: string
    changes?: Array<{
      field: string
      value: MetaQualityValue
    }>
  }>
}

interface MetaQualityValue {
  phone_number?: string
  display_phone_number?: string
  event?: string
  current_limit?: string
  quality_score?: string
}
