/**
 * Meta Graph API client for the "import all accounts" flow.
 *
 * Token decision (see also schema.ts `accessTokenEncrypted`):
 * The token used here is the one obtained by exchanging the Embedded Signup
 * `code` (granted with `whatsapp_business_management` + `business_management`).
 * We deliberately do NOT rely on a single env `META_SYSTEM_USER_TOKEN`, because
 * the business has 10+ separate Meta profiles/BMs and one System User token only
 * covers the WABAs owned by/shared to a single BM. Each "Conectar perfil" run
 * yields a token scoped to that profile's businesses; we store it per imported
 * number and reuse it for provisioning and quality sync.
 */

const API_VERSION = process.env.META_API_VERSION ?? "v21.0"
const GRAPH = "https://graph.facebook.com"

interface GraphPage<T> {
  data?: T[]
  paging?: { next?: string }
  error?: { message: string; type?: string; code?: number }
}

interface GraphError {
  error?: { message: string }
}

/** Follow Graph API cursor pagination until exhausted. */
async function fetchAllPages<T>(initialUrl: string): Promise<T[]> {
  const out: T[] = []
  let next: string | undefined = initialUrl
  while (next) {
    const res = await fetch(next)
    const json = (await res.json()) as GraphPage<T>
    if (!res.ok || json.error) {
      throw new Error(`Graph API error: ${json.error?.message ?? `HTTP ${res.status}`}`)
    }
    out.push(...(json.data ?? []))
    next = json.paging?.next
  }
  return out
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
  // The `code` comes from FB.login (JS SDK) with config_id (Embedded Signup).
  // For that flow the code is bound to the app ORIGIN registered under
  // "Allowed Domains for the JavaScript SDK" — not to a callback URL and not empty.
  // The redirect_uri here must match that origin exactly, including the trailing
  // slash, or Meta fails with "redirect_uri is not identical".
  const origin = (process.env.ATLAS_PUBLIC_URL ?? "https://atlas.ebooksdgg.lat/").replace(
    /\/?$/,
    "/"
  )
  const url =
    `${GRAPH}/${API_VERSION}/oauth/access_token?` +
    new URLSearchParams({
      client_id: params.appId,
      client_secret: params.appSecret,
      redirect_uri: origin,
      code: params.code,
    }).toString()

  const res = await fetch(url)
  const data = (await res.json()) as { access_token?: string } & GraphError
  if (!res.ok || data.error || !data.access_token) {
    throw new Error(`Token exchange failed: ${data.error?.message ?? `HTTP ${res.status}`}`)
  }
  return data.access_token
}

// ─── Account discovery ──────────────────────────────────────────────────────────

export interface DiscoveredNumber {
  phoneNumberId: string
  wabaId: string
  businessId: string
  businessName: string
  displayPhoneNumber: string
  verifiedName: string | null
  qualityRating: string
  messagingTier: string | null
}

interface GraphBusiness {
  id: string
  name?: string
}

interface GraphWaba {
  id: string
  name?: string
}

interface GraphPhone {
  id: string
  display_phone_number?: string
  verified_name?: string
  quality_rating?: string
  messaging_limit_tier?: string
}

/**
 * List every WABA and phone number reachable with the given token, across all
 * Business Managers the token has access to. Captures the BM name (business_name)
 * for each number so the dashboard can filter by BM.
 */
export async function listAllAccounts(token: string): Promise<DiscoveredNumber[]> {
  // 1. Businesses (Business Managers) the token can see.
  const businesses = await fetchAllPages<GraphBusiness>(
    `${GRAPH}/${API_VERSION}/me/businesses?fields=id,name&limit=100&access_token=${encodeURIComponent(token)}`
  )

  const numbers: DiscoveredNumber[] = []

  for (const biz of businesses) {
    const bizName = biz.name ?? biz.id

    // 2. WABAs owned by this business.
    const wabas = await fetchAllPages<GraphWaba>(
      `${GRAPH}/${API_VERSION}/${biz.id}/owned_whatsapp_business_accounts?fields=id,name&limit=100&access_token=${encodeURIComponent(token)}`
    )

    for (const waba of wabas) {
      // 3. Phone numbers under this WABA.
      const phones = await fetchAllPages<GraphPhone>(
        `${GRAPH}/${API_VERSION}/${waba.id}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,messaging_limit_tier&limit=100&access_token=${encodeURIComponent(token)}`
      )

      for (const p of phones) {
        numbers.push({
          phoneNumberId: p.id,
          wabaId: waba.id,
          businessId: biz.id,
          businessName: bizName,
          displayPhoneNumber: p.display_phone_number ?? "",
          verifiedName: p.verified_name ?? null,
          qualityRating: p.quality_rating ?? "UNKNOWN",
          messagingTier: p.messaging_limit_tier ?? null,
        })
      }
    }
  }

  return numbers
}

/** Normalize Meta's quality rating string to our enum domain. */
export function normalizeQuality(
  raw: string | null
): "GREEN" | "YELLOW" | "RED" | "UNKNOWN" {
  const v = raw?.toUpperCase() ?? ""
  if (v === "GREEN" || v === "YELLOW" || v === "RED") return v
  return "UNKNOWN"
}
