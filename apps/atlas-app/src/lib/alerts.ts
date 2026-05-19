interface AlertPayload {
  eventType: string
  numberId: string
  phoneNumber: string
  productSlug: string | null
  productName: string | null
  evolutionInstanceName: string | null
  data?: Record<string, unknown>
}

async function postToN8n(url: string, payload: AlertPayload): Promise<void> {
  if (!url) return
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  } catch (e) {
    console.error(`[alerts] Failed to call n8n webhook ${url}:`, e)
  }
}

export async function sendQualityAlert(payload: AlertPayload): Promise<void> {
  await postToN8n(
    process.env.N8N_QUALITY_ALERT_WEBHOOK_URL ?? "",
    payload
  )
}

export async function sendDisconnectAlert(payload: AlertPayload): Promise<void> {
  await postToN8n(
    process.env.N8N_DISCONNECT_ALERT_WEBHOOK_URL ?? "",
    payload
  )
}
