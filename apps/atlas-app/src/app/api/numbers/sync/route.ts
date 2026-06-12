import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { numbers, eventLog } from "@/lib/db/schema"
import { eq, and, ne } from "drizzle-orm"
import { sendQualityAlert } from "@/lib/alerts"
import { decrypt } from "@/lib/crypto"

// Called by n8n (03-daily-health) or any external scheduler.
// Auth: x-atlas-cron-secret header must match ATLAS_CRON_SECRET env var.
// Also accepts a valid next-auth session (for manual triggering from the UI).

export async function GET(req: NextRequest) {
  const secret = process.env.ATLAS_CRON_SECRET
  if (secret) {
    const header = req.headers.get("x-atlas-cron-secret") ?? ""
    if (header !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  const allNumbers = await db
    .select()
    .from(numbers)
    .where(
      and(
        ne(numbers.status, "disconnected"),
        ne(numbers.status, "banned")
      )
    )

  const API_VERSION = process.env.META_API_VERSION ?? "v21.0"
  const results: Array<{ id: string; phone: string; updated: boolean; error?: string }> = []

  for (const number of allNumbers) {
    if (!number.phoneNumberId) {
      results.push({ id: number.id, phone: number.phoneNumber, updated: false, error: "no phoneNumberId" })
      continue
    }

    // Prefer the number's own token (each Meta profile/BM has its own). Fall back
    // to the env System User token only if this number has no stored token yet.
    let token = process.env.META_SYSTEM_USER_TOKEN ?? ""
    if (number.accessTokenEncrypted) {
      try {
        token = decrypt(number.accessTokenEncrypted)
      } catch {
        // keep env fallback
      }
    }
    if (!token) {
      results.push({ id: number.id, phone: number.phoneNumber, updated: false, error: "no token" })
      continue
    }

    try {
      const res = await fetch(
        `https://graph.facebook.com/${API_VERSION}/${number.phoneNumberId}?fields=quality_rating,messaging_limit_tier&access_token=${encodeURIComponent(token)}`,
        { next: { revalidate: 0 } }
      )

      if (!res.ok) {
        results.push({ id: number.id, phone: number.phoneNumber, updated: false, error: `Meta ${res.status}` })
        continue
      }

      const data = (await res.json()) as {
        quality_rating?: string
        messaging_limit_tier?: string
        error?: { message: string }
      }

      if (data.error) {
        results.push({ id: number.id, phone: number.phoneNumber, updated: false, error: data.error.message })
        continue
      }

      const newQuality = normalizeQuality(data.quality_rating ?? "")
      const newTier = data.messaging_limit_tier ?? number.messagingTier

      const qualityChanged = number.qualityRating !== newQuality
      const tierChanged = number.messagingTier !== newTier

      if (qualityChanged || tierChanged) {
        const now = new Date()
        await db
          .update(numbers)
          .set({
            qualityRating: newQuality,
            messagingTier: newTier ?? undefined,
            updatedAt: now,
          })
          .where(eq(numbers.id, number.id))

        if (qualityChanged) {
          await db.insert(eventLog).values({
            numberId: number.id,
            eventType: "quality_dropped",
            data: { from: number.qualityRating, to: newQuality, source: "sync" },
          })

          if (shouldAlert(number.qualityRating, newQuality)) {
            await sendQualityAlert({
              eventType: "quality_dropped",
              numberId: number.id,
              phoneNumber: number.phoneNumber,
              productSlug: number.productSlug,
              productName: number.productName,
              evolutionInstanceName: number.evolutionInstanceName,
              data: { from: number.qualityRating, to: newQuality },
            })
          }
        }

        results.push({ id: number.id, phone: number.phoneNumber, updated: true })
      } else {
        results.push({ id: number.id, phone: number.phoneNumber, updated: false })
      }
    } catch (e) {
      results.push({ id: number.id, phone: number.phoneNumber, updated: false, error: String(e) })
    }
  }

  const updated = results.filter((r) => r.updated).length
  const errors = results.filter((r) => r.error).length

  return NextResponse.json({ ok: true, total: allNumbers.length, updated, errors, results })
}

function normalizeQuality(raw: string): "GREEN" | "YELLOW" | "RED" | "UNKNOWN" {
  const s = raw.toUpperCase()
  if (s === "GREEN" || s === "HIGH") return "GREEN"
  if (s === "YELLOW" || s === "MEDIUM") return "YELLOW"
  if (s === "RED" || s === "LOW") return "RED"
  return "UNKNOWN"
}

function shouldAlert(from: string, to: string): boolean {
  const rank: Record<string, number> = { GREEN: 2, YELLOW: 1, RED: 0, UNKNOWN: -1 }
  return (rank[to] ?? -1) < (rank[from] ?? -1)
}
