import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { metaApps } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { decrypt } from "@/lib/crypto"

interface ExchangeCodeBody {
  code: string
  metaAppId: string
  phoneNumberId: string
  wabaId: string
}

interface MetaTokenResponse {
  access_token: string
  token_type: string
  error?: { message: string; type: string; code: number }
}

interface MetaPhoneNumberResponse {
  display_phone_number?: string
  verified_name?: string
  quality_rating?: string
  messaging_limit_tier?: string
  error?: { message: string }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = (await req.json()) as Partial<ExchangeCodeBody>
  const { code, metaAppId, phoneNumberId, wabaId } = body

  if (!code || !metaAppId || !phoneNumberId || !wabaId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  const [app] = await db
    .select()
    .from(metaApps)
    .where(eq(metaApps.id, metaAppId))
    .limit(1)

  if (!app) {
    return NextResponse.json({ error: "Meta app not found" }, { status: 404 })
  }

  const appSecret = decrypt(app.appSecretEncrypted)
  const apiVersion = process.env.META_API_VERSION ?? "v21.0"

  // Exchange code for user access token
  const tokenUrl =
    `https://graph.facebook.com/${apiVersion}/oauth/access_token?` +
    new URLSearchParams({ client_id: app.appId, client_secret: appSecret, code }).toString()

  const tokenRes = await fetch(tokenUrl)
  const tokenData = (await tokenRes.json()) as MetaTokenResponse

  if (!tokenRes.ok || tokenData.error) {
    console.error("[exchange-code] Meta token error:", tokenData.error)
    return NextResponse.json(
      { error: "Token exchange failed", details: tokenData.error?.message },
      { status: 502 }
    )
  }

  const { access_token: accessToken } = tokenData

  // Fetch phone number details from Meta Graph API
  const phoneUrl =
    `https://graph.facebook.com/${apiVersion}/${phoneNumberId}` +
    `?fields=display_phone_number,verified_name,quality_rating,messaging_limit_tier`

  const phoneRes = await fetch(phoneUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  const phoneData = phoneRes.ok
    ? ((await phoneRes.json()) as MetaPhoneNumberResponse)
    : ({} as MetaPhoneNumberResponse)

  return NextResponse.json({
    accessToken,
    phoneNumberId,
    wabaId,
    metaAppId,
    phoneNumber: phoneData.display_phone_number ?? null,
    displayName: phoneData.verified_name ?? null,
    qualityRating: phoneData.quality_rating ?? "UNKNOWN",
    messagingTier: phoneData.messaging_limit_tier ?? null,
  })
}
