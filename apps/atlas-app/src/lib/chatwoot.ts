/**
 * Chatwoot API client
 * Docs: https://www.chatwoot.com/developers/api
 * All calls use api_access_token header.
 */

function base(): string {
  return (process.env.CHATWOOT_API_URL ?? "").replace(/\/$/, "")
}

function headers(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    api_access_token: process.env.CHATWOOT_API_TOKEN ?? "",
  }
}

export function accountId(): string {
  return process.env.CHATWOOT_ACCOUNT_ID ?? "1"
}

async function call(path: string, options: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${base()}${path}`, {
    ...options,
    headers: { ...headers(), ...(options.headers as Record<string, string>) },
  })
  return res
}

// ─── Labels ───────────────────────────────────────────────────────────────────

interface ChatwootLabelListResponse {
  payload: Array<{ id: number; title: string }>
}

export async function ensureLabel(title: string): Promise<void> {
  const accId = accountId()

  // Check if label already exists
  const listRes = await call(`/api/v1/accounts/${accId}/labels`)
  if (listRes.ok) {
    const list = (await listRes.json()) as ChatwootLabelListResponse
    if (list.payload?.some((l) => l.title === title)) return
  }

  // Create label
  const createRes = await call(`/api/v1/accounts/${accId}/labels`, {
    method: "POST",
    body: JSON.stringify({ title, color: "#1877F2", show_on_sidebar: true }),
  })

  if (!createRes.ok) {
    // Non-fatal: log and continue. Label can be created manually later.
    const text = await createRes.text()
    console.warn(`[chatwoot] ensureLabel "${title}" failed (${createRes.status}): ${text}`)
  }
}
