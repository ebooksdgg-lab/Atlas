import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { metaApps, numbers } from "@/lib/db/schema"
import { eq, sql } from "drizzle-orm"
import { decrypt, encrypt } from "@/lib/crypto"
import { exchangeCodeForToken, listAllAccounts, normalizeQuality } from "@/lib/meta"

interface ImportBody {
  code: string
  metaAppId: string
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { code, metaAppId } = (await req.json()) as Partial<ImportBody>
  if (!code || !metaAppId) {
    return NextResponse.json({ error: "Missing code or metaAppId" }, { status: 400 })
  }

  // ── 1. Resolve the Meta app and exchange the code server-side ───────────────
  const [app] = await db
    .select()
    .from(metaApps)
    .where(eq(metaApps.id, metaAppId))
    .limit(1)

  if (!app) return NextResponse.json({ error: "Meta app not found" }, { status: 404 })

  let token: string
  try {
    token = await exchangeCodeForToken({
      code,
      appId: app.appId,
      appSecret: decrypt(app.appSecretEncrypted),
    })
  } catch (e) {
    console.error("[import] token exchange error:", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Token exchange failed" },
      { status: 502 }
    )
  }

  // ── 2. Discover all WABAs + numbers reachable with this token ────────────────
  let discovered
  try {
    discovered = await listAllAccounts(token)
  } catch (e) {
    console.error("[import] discovery error:", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Account discovery failed" },
      { status: 502 }
    )
  }

  // The token is shared across every number of this profile; encrypt once.
  const tokenEncrypted = encrypt(token)

  // ── 3. Upsert each discovered number ────────────────────────────────────────
  // New numbers enter as `unassigned`. For numbers that already exist (matched by
  // phone_number_id), we update ONLY Meta data + the token — never status, product
  // or typebot binding, so already-assigned/active numbers keep their assignment.
  let created = 0
  let updated = 0

  for (const n of discovered) {
    const cleanPhone = (n.displayPhoneNumber || n.phoneNumberId).replace(/[^0-9]/g, "")
    const phoneE164 = n.displayPhoneNumber ? `+${cleanPhone}` : cleanPhone
    const now = new Date()

    const res = await db
      .insert(numbers)
      .values({
        phoneNumber: phoneE164,
        displayName: n.verifiedName,
        businessId: n.businessId,
        businessName: n.businessName,
        wabaId: n.wabaId,
        phoneNumberId: n.phoneNumberId,
        accessTokenEncrypted: tokenEncrypted,
        metaAppUsed: metaAppId,
        status: "unassigned",
        qualityRating: normalizeQuality(n.qualityRating),
        messagingTier: n.messagingTier,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: numbers.phoneNumberId,
        set: {
          // Meta data + token only — status/product/typebot left untouched.
          displayName: n.verifiedName,
          businessId: n.businessId,
          businessName: n.businessName,
          wabaId: n.wabaId,
          accessTokenEncrypted: tokenEncrypted,
          qualityRating: normalizeQuality(n.qualityRating),
          messagingTier: n.messagingTier,
          updatedAt: now,
        },
      })
      .returning({ inserted: sql<boolean>`(xmax = 0)` })

    if (res[0]?.inserted) created++
    else updated++
  }

  return NextResponse.json({
    ok: true,
    total: discovered.length,
    created,
    updated,
  })
}
