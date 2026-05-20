import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { numbers, eventLog } from "@/lib/db/schema"
import type { PhoneNumber } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { sendDisconnectAlert, sendQualityAlert } from "@/lib/alerts"

// Evolution API sends a flat JSON body (no shared secret by default on v2).
// To harden this endpoint, set EVOLUTION_WEBHOOK_SECRET in .env and configure
// the same value in Evolution's webhook headers.

export async function POST(req: NextRequest) {
  const secret = process.env.EVOLUTION_WEBHOOK_SECRET
  if (secret) {
    const header = req.headers.get("x-evolution-secret") ?? ""
    if (header !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  let body: EvolutionEvent
  try {
    body = (await req.json()) as EvolutionEvent
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const instanceName = body.instance?.instanceName ?? body.instanceName
  if (!instanceName) return NextResponse.json({ ok: true })

  const [number] = await db
    .select()
    .from(numbers)
    .where(eq(numbers.evolutionInstanceName, instanceName))
    .limit(1)

  if (!number) return NextResponse.json({ ok: true })

  switch (body.event) {
    case "connection.update":
      await handleConnectionUpdate(number, body.data as ConnectionData)
      break
    case "messages.upsert":
      await handleMessagesUpsert(number)
      break
    default:
      break
  }

  return NextResponse.json({ ok: true })
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

type NumberRow = PhoneNumber

async function handleConnectionUpdate(
  number: NumberRow,
  data: ConnectionData
): Promise<void> {
  if (!data?.state) return

  const state = data.state.toLowerCase()

  if (state === "close" && number.status !== "disconnected") {
    const now = new Date()
    await db
      .update(numbers)
      .set({ status: "disconnected", updatedAt: now })
      .where(eq(numbers.id, number.id))

    await db.insert(eventLog).values({
      numberId: number.id,
      eventType: "disconnected",
      data: { source: "evolution", reason: data.reason ?? "connection closed" },
    })

    await sendDisconnectAlert({
      eventType: "disconnected",
      numberId: number.id,
      phoneNumber: number.phoneNumber,
      productSlug: number.productSlug,
      productName: number.productName,
      evolutionInstanceName: number.evolutionInstanceName,
      data: { source: "evolution", reason: data.reason },
    })
  }

  if (state === "open" && number.status === "disconnected") {
    const now = new Date()
    await db
      .update(numbers)
      .set({ status: "active", updatedAt: now })
      .where(eq(numbers.id, number.id))

    await db.insert(eventLog).values({
      numberId: number.id,
      eventType: "connected",
      data: { source: "evolution" },
    })
  }
}

async function handleMessagesUpsert(number: NumberRow): Promise<void> {
  await db
    .update(numbers)
    .set({ lastActivityAt: new Date(), updatedAt: new Date() })
    .where(eq(numbers.id, number.id))
}

// ─── Evolution webhook types ──────────────────────────────────────────────────

interface EvolutionEvent {
  event: string
  instance?: { instanceName: string }
  instanceName?: string
  data?: unknown
}

interface ConnectionData {
  state?: string
  reason?: string
}
