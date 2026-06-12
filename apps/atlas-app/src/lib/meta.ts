/**
 * Meta Graph API client for the WhatsApp Embedded Signup connect flow.
 *
 * Token decision (see also schema.ts `accessTokenEncrypted`):
 * Exchanging the Embedded Signup `code` yields a Business Integration System User
 * access token — a long-lived token Meta mints for the integration, valid for the
 * WABA of ANY Business Manager that completed the signup (not just our own). That
 * is why we do NOT use the single env `META_SYSTEM_USER_TOKEN` (which only covers
 * our own BM): we store this token per connected number, encrypted, and reuse it
 * for provisioning (Evolution/Chatwoot) and quality sync.
 */

const API_VERSION = process.env.META_API_VERSION ?? "v21.0"
const GRAPH = "https://graph.facebook.com"

interface GraphError {
  error?: { message: string; type?: string; code?: number }
}

// ─── Token exchange ─────────────────────────────────────────────────────────────

/**
 * Exchange an Embedded Signup authorization `code` for an access token.
 * Returns the raw token string. Caller is responsible for encrypting it.
 */
export async function exchangeCodeForToken(params: {
  code: string
  appId: string
  appSecret: string
}): Promise<string> {
  // The `code` comes from FB.login with response_type:"code" + config_id
  // (Embedded Signup). Per Meta's docs, that code is exchanged with ONLY
  // client_id, client_secret and code — no redirect_uri at all (sending one,
  // even empty, makes Meta try to validate it as an App Domain and fail).
  const url =
    `${GRAPH}/${API_VERSION}/oauth/access_token?` +
    new URLSearchParams({
      client_id: params.appId,
      client_secret: params.appSecret,
      code: params.code,
    }).toString()

  const res = await fetch(url)
  const data = (await res.json()) as { access_token?: string } & GraphError
  if (!res.ok || data.error || !data.access_token) {
    throw new Error(`Token exchange failed: ${data.error?.message ?? `HTTP ${res.status}`}`)
  }
  return data.access_token
}

// ─── WABA subscription ──────────────────────────────────────────────────────────

/**
 * Subscribe our app to the WABA so it receives webhooks and can operate on the
 * number. Required step right after the token exchange.
 */
export async function subscribeAppToWaba(wabaId: string, token: string): Promise<void> {
  const res = await fetch(`${GRAPH}/${API_VERSION}/${wabaId}/subscribed_apps`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = (await res.json()) as { success?: boolean } & GraphError
  if (!res.ok || data.error) {
    throw new Error(`subscribed_apps failed: ${data.error?.message ?? `HTTP ${res.status}`}`)
  }
}

// ─── Phone number + business details ─────────────────────────────────────────────

export interface PhoneNumberDetails {
  displayPhoneNumber: string
  verifiedName: string | null
  qualityRating: string
  messagingTier: string | null
}

export async function getPhoneNumberDetails(
  phoneNumberId: string,
  token: string
): Promise<PhoneNumberDetails> {
  const url =
    `${GRAPH}/${API_VERSION}/${phoneNumberId}` +
    `?fields=display_phone_number,verified_name,quality_rating,messaging_limit_tier`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const data = (await res.json()) as {
    display_phone_number?: string
    verified_name?: string
    quality_rating?: string
    messaging_limit_tier?: string
  } & GraphError
  if (!res.ok || data.error) {
    throw new Error(`phone_number fetch failed: ${data.error?.message ?? `HTTP ${res.status}`}`)
  }
  return {
    displayPhoneNumber: data.display_phone_number ?? "",
    verifiedName: data.verified_name ?? null,
    qualityRating: data.quality_rating ?? "UNKNOWN",
    messagingTier: data.messaging_limit_tier ?? null,
  }
}

export interface WabaBusiness {
  businessId: string
  businessName: string
}

/** Resolve the owning Business Manager of a WABA (for the dashboard BM filter). */
export async function getWabaBusiness(wabaId: string, token: string): Promise<WabaBusiness> {
  const url = `${GRAPH}/${API_VERSION}/${wabaId}?fields=name,owner_business_info`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const data = (await res.json()) as {
    name?: string
    owner_business_info?: { id?: string; name?: string }
  } & GraphError
  if (!res.ok || data.error) {
    throw new Error(`waba fetch failed: ${data.error?.message ?? `HTTP ${res.status}`}`)
  }
  return {
    businessId: data.owner_business_info?.id ?? "",
    businessName: data.owner_business_info?.name ?? data.name ?? "",
  }
}

/** Normalize Meta's quality rating string to our enum domain. */
export function normalizeQuality(
  raw: string | null
): "GREEN" | "YELLOW" | "RED" | "UNKNOWN" {
  const v = raw?.toUpperCase() ?? ""
  if (v === "GREEN" || v === "YELLOW" || v === "RED") return v
  return "UNKNOWN"
}
