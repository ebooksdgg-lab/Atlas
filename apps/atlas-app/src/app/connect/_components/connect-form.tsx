"use client"

import { useState, useRef } from "react"
import Script from "next/script"

type ProductInfo = { id: string; slug: string; name: string }
type AppInfo = { id: string; appId: string; configId: string | null; isActive: boolean }

type FlowState =
  | { step: "idle" }
  | { step: "launching" }
  | { step: "exchanging" }
  | { step: "creating"; phase: number }
  | { step: "success"; phoneNumber: string }
  | { step: "error"; message: string }

const PHASES = [
  "Configurando Evolution API…",
  "Creando inbox en Chatwoot…",
  "Asociando flujo de Typebot…",
]

export function ConnectForm({
  products,
  activeApp,
  apiVersion,
}: {
  products: ProductInfo[]
  activeApp: AppInfo | null
  apiVersion: string
}) {
  const [fbReady, setFbReady] = useState(false)
  const [flow, setFlow] = useState<FlowState>({ step: "idle" })
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id ?? "")
  const [internalLabel, setInternalLabel] = useState("")

  // Captured from Meta's window message event during popup
  const phoneNumberIdRef = useRef("")
  const wabaIdRef = useRef("")

  async function handleConnect() {
    if (!activeApp || !fbReady || !selectedProductId) return
    setFlow({ step: "launching" })
    phoneNumberIdRef.current = ""
    wabaIdRef.current = ""

    // Meta sends phone_number_id and waba_id via postMessage during the signup flow
    const messageHandler = (event: MessageEvent) => {
      if (event.origin !== "https://www.facebook.com") return
      try {
        const data = JSON.parse(event.data as string) as {
          type?: string
          event?: string
          data?: { phone_number_id?: string; waba_id?: string }
        }
        if (data.type === "WA_EMBEDDED_SIGNUP" && data.event === "FINISH") {
          phoneNumberIdRef.current = data.data?.phone_number_id ?? ""
          wabaIdRef.current = data.data?.waba_id ?? ""
        }
      } catch {}
    }
    window.addEventListener("message", messageHandler)

    const handleResponse = async (response: FBLoginResponse) => {
        window.removeEventListener("message", messageHandler)

        if (!response.authResponse?.code) {
          setFlow({ step: "error", message: "La conexión con Meta fue cancelada o falló." })
          return
        }

        const code = response.authResponse.code
        // Fallback: some SDK versions include these directly in authResponse
        const phoneNumberId =
          phoneNumberIdRef.current || response.authResponse.phone_number_id || ""
        const wabaId = wabaIdRef.current || response.authResponse.waba_id || ""

        if (!phoneNumberId || !wabaId) {
          setFlow({
            step: "error",
            message: "Meta no devolvió el número de teléfono. Intentá de nuevo.",
          })
          return
        }

        setFlow({ step: "exchanging" })

        // Step 1: exchange code for access token + phone number details
        const exchRes = await fetch("/api/whatsapp/embedded-signup/exchange-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code,
            metaAppId: activeApp.id,
            phoneNumberId,
            wabaId,
          }),
        })

        if (!exchRes.ok) {
          const err = (await exchRes.json()) as { error?: string }
          setFlow({
            step: "error",
            message: err.error ?? "Error al intercambiar credenciales con Meta.",
          })
          return
        }

        const exchData = (await exchRes.json()) as {
          accessToken: string
          phoneNumberId: string
          wabaId: string
          phoneNumber: string
          displayName: string
          qualityRating: string
          messagingTier: string
          metaAppId: string
        }

        setFlow({ step: "creating", phase: 0 })

        // Step 2: create the number in Atlas (Evolution + Chatwoot + Typebot)
        const createRes = await fetch("/api/numbers/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...exchData,
            productId: selectedProductId,
            internalLabel: internalLabel.trim() || null,
          }),
        })

        if (!createRes.ok) {
          const err = (await createRes.json()) as { error?: string }
          setFlow({
            step: "error",
            message: err.error ?? "Error al crear el número en Atlas.",
          })
          return
        }

        const created = (await createRes.json()) as { phoneNumber?: string }
        setFlow({
          step: "success",
          phoneNumber: created.phoneNumber ?? exchData.phoneNumber ?? phoneNumberId,
        })
      }

    window.FB.login(
      (response) => { handleResponse(response) },
      {
        ...(activeApp.configId ? { config_id: activeApp.configId } : {}),
        response_type: "code",
        override_default_response_type: true,
        extras: {
          setup: {},
          sessionInfoVersion: "3",
        },
      }
    )
  }

  // ─── Success state ────────────────────────────────────────────────────────

  if (flow.step === "success") {
    return (
      <div className="rounded-lg border bg-card p-6 space-y-4 text-center">
        <p className="text-4xl">✅</p>
        <p className="font-semibold text-lg">Número activo</p>
        <p className="text-muted-foreground font-mono">{flow.phoneNumber}</p>
        <button
          onClick={() => {
            setFlow({ step: "idle" })
            setInternalLabel("")
          }}
          className="rounded border border-input px-4 py-2 text-sm hover:bg-muted"
        >
          Conectar otro número
        </button>
      </div>
    )
  }

  // ─── Creating state (progress steps) ─────────────────────────────────────

  if (flow.step === "creating") {
    return (
      <div className="rounded-lg border bg-card p-6 space-y-4">
        <p className="text-sm font-medium text-muted-foreground mb-2">Configurando…</p>
        {PHASES.map((label, i) => (
          <div key={i} className="flex items-center gap-3 text-sm">
            {i < flow.phase ? (
              <span className="text-green-600 font-bold w-4">✓</span>
            ) : i === flow.phase ? (
              <span className="text-primary w-4 animate-spin inline-block">⟳</span>
            ) : (
              <span className="text-muted-foreground w-4">○</span>
            )}
            <span className={i > flow.phase ? "text-muted-foreground" : ""}>{label}</span>
          </div>
        ))}
      </div>
    )
  }

  // ─── No active app warning ────────────────────────────────────────────────

  if (!activeApp) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-4 text-sm text-amber-800 dark:text-amber-300">
        No hay una Meta App activa. Configurá una en{" "}
        <a href="/settings" className="underline font-medium">
          Configuración
        </a>{" "}
        antes de conectar un número.
      </div>
    )
  }

  // ─── Idle / error form ────────────────────────────────────────────────────

  return (
    <>
      {activeApp && (
        <Script
          src="https://connect.facebook.net/en_US/sdk.js"
          strategy="lazyOnload"
          onLoad={() => {
            window.FB.init({
              appId: activeApp.appId,
              autoLogAppEvents: true,
              xfbml: true,
              version: apiVersion,
            })
            setFbReady(true)
          }}
        />
      )}

      <div className="space-y-5">
        {/* Product */}
        <div>
          <label className="block text-sm font-medium mb-1.5">Producto *</label>
          {products.length === 0 ? (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Sin productos activos.{" "}
              <a href="/settings" className="underline">
                Creá uno en Configuración.
              </a>
            </p>
          ) : (
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Internal label */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            Etiqueta interna{" "}
            <span className="text-muted-foreground font-normal">(opcional)</span>
          </label>
          <input
            type="text"
            value={internalLabel}
            onChange={(e) => setInternalLabel(e.target.value)}
            placeholder="Ej: Número principal Lucho"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Active app info */}
        <p className="text-xs text-muted-foreground">
          Usando Meta App:{" "}
          <span className="font-mono">
            {activeApp.id} ({activeApp.appId.slice(0, 10)}…)
          </span>
        </p>

        {/* Error */}
        {flow.step === "error" && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3">
            <p className="text-destructive text-sm">{flow.message}</p>
            <button
              onClick={() => setFlow({ step: "idle" })}
              className="text-xs text-destructive underline mt-1"
            >
              Intentar de nuevo
            </button>
          </div>
        )}

        {/* Connect button */}
        <button
          onClick={handleConnect}
          disabled={
            !fbReady ||
            products.length === 0 ||
            !selectedProductId ||
            flow.step === "launching" ||
            flow.step === "exchanging"
          }
          className="w-full rounded-md bg-[#1877F2] text-white px-4 py-3 text-sm font-semibold hover:bg-[#166FE5] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {flow.step === "launching"
            ? "Abriendo ventana de Meta…"
            : flow.step === "exchanging"
              ? "Intercambiando credenciales…"
              : !fbReady
                ? "Cargando SDK…"
                : "Conectar con WhatsApp Business"}
        </button>
      </div>
    </>
  )
}
