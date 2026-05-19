import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { numbers, products, eventLog } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { createCloudInstance, deleteInstance, setTypebot } from "@/lib/evolution"
import { createWhatsAppInbox, ensureLabel } from "@/lib/chatwoot"

interface CreateNumberBody {
  accessToken: string
  phoneNumberId: string
  wabaId: string
  metaAppId: string
  phoneNumber: string | null
  displayName: string | null
  qualityRating: string | null
  messagingTier: string | null
  productId: string
  internalLabel: string | null
}

function normalizeQuality(
  raw: string | null
): "GREEN" | "YELLOW" | "RED" | "UNKNOWN" {
  const map: Record<string, "GREEN" | "YELLOW" | "RED" | "UNKNOWN"> = {
    GREEN: "GREEN",
    YELLOW: "YELLOW",
    RED: "RED",
  }
  return map[raw?.toUpperCase() ?? ""] ?? "UNKNOWN"
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = (await req.json()) as Partial<CreateNumberBody>
  const {
    accessToken,
    phoneNumberId,
    wabaId,
    metaAppId,
    phoneNumber,
    displayName,
    qualityRating,
    messagingTier,
    productId,
    internalLabel,
  } = body

  if (!accessToken || !phoneNumberId || !wabaId || !metaAppId || !productId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  // ── 1. Look up product ──────────────────────────────────────────────────────
  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, productId))
    .limit(1)

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 })
  }

  // ── 2. Prepare identifiers ─────────────────────────────────────────────────
  const cleanPhone = (phoneNumber ?? phoneNumberId).replace(/[^0-9]/g, "")
  const instanceName = `atlas-${cleanPhone}`
  const typebotViewerUrl =
    process.env.TYPEBOT_VIEWER_URL ?? "http://typebot-viewer:3000"

  // ── 3. Create Evolution Cloud API instance ─────────────────────────────────
  let evoInstance: { instanceName: string }
  try {
    evoInstance = await createCloudInstance({
      instanceName,
      phoneNumber: cleanPhone,
      wabaId,
      phoneNumberId,
      accessToken,
    })
  } catch (e) {
    console.error("[numbers/create] Evolution error:", e)
    return NextResponse.json(
      { error: "Evolution API error: " + (e instanceof Error ? e.message : String(e)) },
      { status: 502 }
    )
  }

  // ── 4. Set Typebot integration ─────────────────────────────────────────────
  if (product.typebotId) {
    try {
      await setTypebot({
        instanceName: evoInstance.instanceName,
        viewerUrl: typebotViewerUrl,
        typebotId: product.typebotId,
      })
    } catch (e) {
      console.error("[numbers/create] Typebot setup error:", e)
      await deleteInstance(evoInstance.instanceName)
      return NextResponse.json(
        { error: "Typebot setup error: " + (e instanceof Error ? e.message : String(e)) },
        { status: 502 }
      )
    }
  }

  // ── 5. Create Chatwoot inbox ───────────────────────────────────────────────
  let chatwootInboxId: number | null = null
  try {
    const inbox = await createWhatsAppInbox({
      name: `${displayName ?? cleanPhone} — ${product.name}`,
      phoneNumber: `+${cleanPhone}`,
      accessToken,
      phoneNumberId,
      wabaId,
    })
    chatwootInboxId = inbox.id

    // Ensure the product label exists (non-fatal if it fails)
    await ensureLabel(`producto-${product.slug}`)
  } catch (e) {
    console.error("[numbers/create] Chatwoot error:", e)
    await deleteInstance(evoInstance.instanceName)
    return NextResponse.json(
      { error: "Chatwoot error: " + (e instanceof Error ? e.message : String(e)) },
      { status: 502 }
    )
  }

  // ── 6. Insert DB record ────────────────────────────────────────────────────
  const now = new Date()
  const [number] = await db
    .insert(numbers)
    .values({
      phoneNumber: `+${cleanPhone}`,
      displayName: displayName ?? null,
      wabaId,
      phoneNumberId,
      productSlug: product.slug,
      productName: product.name,
      metaAppUsed: metaAppId,
      internalLabel: internalLabel ?? null,
      status: "active",
      qualityRating: normalizeQuality(qualityRating ?? null),
      messagingTier: messagingTier ?? null,
      evolutionInstanceName: evoInstance.instanceName,
      chatwootInboxId,
      typebotId: product.typebotId ?? null,
      connectedAt: now,
      lastActivityAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  // ── 7. Log event ───────────────────────────────────────────────────────────
  await db.insert(eventLog).values({
    numberId: number.id,
    eventType: "connected",
    data: {
      productSlug: product.slug,
      instanceName: evoInstance.instanceName,
      chatwootInboxId,
    },
  })

  return NextResponse.json(number)
}
