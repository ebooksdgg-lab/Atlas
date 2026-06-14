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
    number: params.phoneNumber,
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
  // Non-fatal — silence errors
  try {
    await call(`/typebot/set/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      body: JSON.stringify({ enabled: false }),
    })
  } catch {}
}

// ─── Typebot ──────────────────────────────────────────────────────────────────

export interface SetTypebotParams {
  instanceName: string
  viewerUrl: string  // e.g. "http://typebot-viewer:3000"
  typebotId: string  // Typebot flow slug or ID
}

export async function setTypebot(params: SetTypebotParams): Promise<void> {
  const body = {
    enabled: true,
    url: params.viewerUrl,
    typebot: params.typebotId,
    expire: 0,
    keywordFinish: "",
    delayMessage: 1000,
    unknownMessage: "",
    listeningFromMe: false,
    stopBotFromMe: false,
    keepOpen: false,
    debounceTime: 10,
  }

  // Evolution v2: POST /typebot/set/{instance} or /typebot/create/{instance}
  const res = await call(
    `/typebot/set/${encodeURIComponent(params.instanceName)}`,
    { method: "POST", body: JSON.stringify(body) }
  )

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Evolution setTypebot failed (${res.status}): ${text}`)
  }
}
