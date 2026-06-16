/**
 * Evolution API client — WHATSAPP-BUSINESS integration (official Cloud API)
 * Endpoints follow Evolution API v2 (atendai/evolution-api:latest)
 * All calls use the global apikey header.
 */

function base(): string {
  return (process.env.EVOLUTION_API_URL ?? "").replace(/\/$/, "")
}

function headers(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    apikey: process.env.EVOLUTION_AUTH_API_KEY ?? "",
  }
}

async function call(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const res = await fetch(`${base()}${path}`, {
    ...options,
    headers: { ...headers(), ...(options.headers as Record<string, string>) },
  })
  return res
}

// ─── Instance ─────────────────────────────────────────────────────────────────

export interface CreateCloudInstanceParams {
  instanceName: string
  phoneNumber: string   // digits only, e.g. "5491123456789"
  wabaId: string
  phoneNumberId: string
  accessToken: string   // user access token from Meta OAuth
}

export async function createCloudInstance(
  params: CreateCloudInstanceParams
): Promise<{ instanceName: string }> {
  const body = {
    instanceName: params.instanceName,
    integration: "WHATSAPP-BUSINESS",
    // Evolution stores `number` and uses it as the phone_number_id: it matches
    // inbound webhooks via value.metadata.phone_number_id === instance.number AND
    // builds the outbound Graph URL as /{number}/messages. So `number` must be the
    // phone_number_id, NOT the display phone number.
    number: params.phoneNumberId,
    token: params.accessToken,
    businessId: params.wabaId,
    qrcode: false,
  }

  const res = await call("/instance/create", {
    method: "POST",
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Evolution createInstance failed (${res.status}): ${text}`)
  }

  const data = (await res.json()) as {
    instance?: { instanceName?: string }
    instanceName?: string
  }
  // Response shape varies between Evolution versions
  const name =
    data?.instance?.instanceName ?? data?.instanceName ?? params.instanceName
  return { instanceName: name }
}

export async function deleteInstance(instanceName: string): Promise<void> {
  // Best-effort — do not throw (used for cleanup and for intentional disconnect)
  try {
    await call(`/instance/delete/${encodeURIComponent(instanceName)}`, {
      method: "DELETE",
    })
  } catch {}
}

export async function disableTypebot(instanceName: string): Promise<void> {
  // Evolution 2.2.3 has no /typebot/set toggle; "disabling" = removing the bot(s)
  // from the instance. clearTypebots is best-effort and never throws.
  await clearTypebots(instanceName)
}

// ─── Chatwoot integration ─────────────────────────────────────────────────────

export interface SetChatwootParams {
  instanceName: string
  nameInbox: string
}

export async function setChatwootIntegration(
  params: SetChatwootParams
): Promise<number | null> {
  const body = {
    enabled: true,
    accountId: process.env.CHATWOOT_ACCOUNT_ID ?? "1",
    token: process.env.CHATWOOT_API_TOKEN ?? "",
    url: (process.env.CHATWOOT_API_URL ?? "").replace(/\/$/, ""),
    reopenConversation: true,
    conversationPending: false,
    nameInbox: params.nameInbox,
    importContacts: false,
    importMessages: false,
    autoCreate: true,
    // false → outbound messages are NOT prefixed with the agent name ("Gabriel: …")
    signMsg: false,
  }

  const res = await call(
    `/chatwoot/set/${encodeURIComponent(params.instanceName)}`,
    { method: "POST", body: JSON.stringify(body) }
  )

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Evolution setChatwoot failed (${res.status}): ${text}`)
  }

  // Extract inbox ID from Evolution's response if present
  const data = (await res.json()) as {
    chatwoot?: { inboxId?: number }
    inboxId?: number
  } | null
  return data?.chatwoot?.inboxId ?? data?.inboxId ?? null
}

// ─── Typebot ──────────────────────────────────────────────────────────────────

export interface SetTypebotParams {
  instanceName: string
  viewerUrl: string  // e.g. "http://typebot-viewer:3000"
  typebotId: string  // Typebot flow slug or ID
}

export async function setTypebot(params: SetTypebotParams): Promise<void> {
  const instance = encodeURIComponent(params.instanceName)

  // Idempotency: Evolution 2.2.3 createBot is NOT idempotent. It rejects a second
  // bot when one already exists (url+typebot → "Typebot already exists") and a
  // `triggerType:'all'` bot is EXCLUSIVE ("you cannot have more bots while it is
  // active"). So on re-assignment (new product → new flow) a plain create 400s.
  // We clear-then-create: delete every existing bot on the instance, then create
  // one fresh — guaranteeing exactly one `all`-trigger bot for the current product.
  await clearTypebots(params.instanceName)

  const body = {
    enabled: true,
    url: params.viewerUrl,
    typebot: params.typebotId,
    // Fire the bot on EVERY inbound message (Evolution drives Typebot per message).
    triggerType: "all",
    expire: 0,
    keywordFinish: "",
    delayMessage: 1000,
    unknownMessage: "",
    listeningFromMe: false,
    stopBotFromMe: false,
    keepOpen: false,
    debounceTime: 10,
  }

  // Evolution v2.2.3 exposes POST /typebot/create/{instance} — there is NO /set route.
  // The TypebotRouter only registers: create/find/fetch/update/delete/settings/
  // fetchSettings/start/changeStatus/fetchSessions/ignoreJid.
  console.log(
    `[setTypebot] create instance=${params.instanceName} typebot=${params.typebotId}`
  )
  const res = await call(`/typebot/create/${instance}`, {
    method: "POST",
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Evolution setTypebot failed (${res.status}): ${text}`)
  }
}

/**
 * Delete every Typebot bot configured on an instance. Best-effort: a failed
 * lookup or delete is logged and swallowed so it never blocks (re)provisioning.
 * Used to make setTypebot idempotent given Evolution's non-idempotent createBot.
 */
async function clearTypebots(instanceName: string): Promise<void> {
  const instance = encodeURIComponent(instanceName)
  try {
    const res = await call(`/typebot/find/${instance}`, { method: "GET" })
    if (!res.ok) return
    const data = (await res.json()) as unknown
    // Evolution returns an array of bot records; be defensive about wrappers.
    const bots: Array<{ id?: string }> = Array.isArray(data)
      ? (data as Array<{ id?: string }>)
      : ((data as { data?: Array<{ id?: string }> })?.data ?? [])
    for (const bot of bots) {
      if (!bot?.id) continue
      try {
        await call(`/typebot/delete/${encodeURIComponent(bot.id)}/${instance}`, {
          method: "DELETE",
        })
      } catch (e) {
        console.error(`[clearTypebots] delete ${bot.id} failed:`, e)
      }
    }
  } catch (e) {
    console.error("[clearTypebots] find failed:", e)
  }
}
