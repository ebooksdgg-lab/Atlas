import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { metaApps, numbers } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { decrypt, encrypt } from "@/lib/crypto"
import {
  exchangeCodeForToken,
  subscribeAppToWaba,
  getPhoneNumberDetails,
  getWabaBusiness,
  normalizeQuality,
} from "@/lib/meta"

interface ConnectBody {
  code: string
  phoneNumberId: string
  wabaId: string
  metaAppId: string
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { code, phoneNumberId, wabaId, metaAppId } = (await req.json()) as Partial<ConnectBody>
  if (!code || !phoneNumberId || !wabaId || !metaAppId) {
    return NextResponse.json(
      { error: "Faltan datos (code, phoneNumberId, wabaId o metaAppId)" },
      { status: 400 }
    )
  }

  // ── 1. Resolve the Meta app ─────────────────────────────────────────────────
  const [app] = await db.select().from(metaApps).where(eq(metaApps.id, metaAppId)).limit(1)
  if (!app) return NextResponse.json({ error: "Meta app not found" }, { status: 404 })

  // ── 2. Exchange the code for a Business Integration System User token ────────
  let token: string
  try {
    token = await exchangeCodeForToken({
      code,
      appId: app.appId,
      appSecret: decrypt(app.appSecretEncrypted),
    })
  } catch (e) {
    console.error("[connect] token exchange error:", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Token exchange failed" },
      { status: 502 }
    )
  }

  // ── 3. Subscribe our app to the WABA ────────────────────────────────────────
  try {
    await subscribeAppToWaba(wabaId, token)
  } catch (e) {
    console.error("[connect] subscribe error:", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "WABA subscription failed" },
      { status: 502 }
    )
  }

  // ── 4. Fetch number + owning business details ───────────────────────────────
  let phone, biz
  try {
    ;[phone, biz] = await Promise.all([
      getPhoneNumberDetails(phoneNumberId, token),
      getWabaBusiness(wabaId, token),
    ])
  } catch (e) {
    console.error("[connect] details fetch error:", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch number details" },
      { status: 502 }
    )
  }

  // ── 5. Persist the number as unassigned ─────────────────────────────────────
  const cleanPhone = (phone.displayPhoneNumber || phoneNumberId).replace(/[^0-9]/g, "")
  const phoneE164 = phone.displayPhoneNumber ? `+${cleanPhone}` : cleanPhone
  const tokenEncrypted = encrypt(token)
  const now = new Date()

  await db
    .insert(numbers)
    .values({
      phoneNumber: phoneE164,
      displayName: phone.verifiedName,
      businessId: biz.businessId,
      businessName: biz.businessName,
      wabaId,
      phoneNumberId,
      accessTokenEncrypted: tokenEncrypted,
      metaAppUsed: metaAppId,
      status: "unassigned",
      qualityRating: normalizeQuality(phone.qualityRating),
      messagingTier: phone.messagingTier,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: numbers.phoneNumberId,
      set: {
        // Meta data + token only — status/product/typebot left untouched so an
        // already-assigned number keeps its assignment if reconnected.
        displayName: phone.verifiedName,
        businessId: biz.businessId,
        businessName: biz.businessName,
        wabaId,
        accessTokenEncrypted: tokenEncrypted,
        qualityRating: normalizeQuality(phone.qualityRating),
        messagingTier: phone.messagingTier,
        updatedAt: now,
      },
    })

  return NextResponse.json({ ok: true, phoneNumber: phoneE164 })
}
