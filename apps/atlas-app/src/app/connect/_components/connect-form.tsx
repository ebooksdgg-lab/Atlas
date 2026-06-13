"use client"

import { useState, useRef } from "react"
import Script from "next/script"

type AppInfo = { id: string; appId: string; configId: string | null; isActive: boolean }

type FlowState =
  | { step: "idle" }
  | { step: "launching" }
  | { step: "connecting" }
  | { step: "success"; phoneNumber: string }
  | { step: "error"; message: string }

export function ConnectForm({
  activeApp,
  apiVersion,
}: {
  activeApp: AppInfo | null
  apiVersion: string
}) {
  const [fbReady, setFbReady] = useState(false)
  const [flow, setFlow] = useState<FlowState>({ step: "idle" })

  // Captured from Meta's WA_EMBEDDED_SIGNUP FINISH postMessage during the popup.
  const phoneNumberIdRef = useRef("")
  const wabaIdRef = useRef("")

  function handleConnect() {
    if (!activeApp || !fbReady) return
    setFlow({ step: "launching" })
    phoneNumberIdRef.current = ""
    wabaIdRef.current = ""

    // Meta delivers phone_number_id + waba_id via postMessage (NOT in the code).
    const messageHandler = (event: MessageEvent) => {
      if (
        event.origin !== "https://www.facebook.com" &&
        event.origin !== "https://web.facebook.com"
      )
        return
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
      const phoneNumberId = phoneNumberIdRef.current
      const wabaId = wabaIdRef.current

      if (!phoneNumberId || !wabaId) {
        setFlow({
          step: "error",
          message: "Meta no devolvió el número de teléfono. Intentá de nuevo.",
        })
        return
      }

      setFlow({ step: "connecting" })

      try {
        const res = await fetch("/api/whatsapp/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, phoneNumberId, wabaId, metaAppId: activeApp.id }),
        })

        if (!res.ok) {
          const err = (await res.json()) as { error?: string }
          setFlow({ step: "error", message: err.error ?? "Error al conectar el número." })
          return
        }

        const data = (await res.json()) as { phoneNumber: string }
        setFlow({ step: "success", phoneNumber: data.phoneNumber })
      } catch (e) {
        setFlow({
          step: "error",
          message: e instanceof Error ? e.message : "Error de red al conectar.",
        })
      }
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

  // ─── Success ──────────────────────────────────────────────────────────────

  if (flow.step === "success") {
    return (
      <div className="rounded-lg border bg-card p-6 space-y-4 text-center">
        <p className="text-4xl">✅</p>
        <p className="font-semibold text-lg">Número conectado</p>
        <p className="text-muted-foreground font-mono">{flow.phoneNumber}</p>
        <p className="text-muted-foreground text-sm">
          Quedó como <span className="font-medium">sin asignar</span>. Asignale un
          producto desde el dashboard.
        </p>
        <div className="flex gap-2 justify-center">
          <a
            href="/dashboard"
            className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90"
          >
            Ir a asignar producto
          </a>
          <button
            onClick={() => setFlow({ step: "idle" })}
            className="rounded border border-input px-4 py-2 text-sm hover:bg-muted"
          >
            Conectar otro número
          </button>
        </div>
      </div>
    )
  }

  // ─── No active app ────────────────────────────────────────────────────────

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

  // ─── Idle / connecting / error ────────────────────────────────────────────

  return (
    <>
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

      <div className="space-y-5">
        <p className="text-xs text-muted-foreground">
          Usando Meta App:{" "}
          <span className="font-mono">
            {activeApp.id} ({activeApp.appId.slice(0, 10)}…)
          </span>
        </p>

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

        <button
          onClick={handleConnect}
          disabled={!fbReady || flow.step === "launching" || flow.step === "connecting"}
          className="w-full rounded-md bg-[#1877F2] text-white px-4 py-3 text-sm font-semibold hover:bg-[#166FE5] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {flow.step === "launching"
            ? "Abriendo ventana de Meta…"
            : flow.step === "connecting"
              ? "Conectando número…"
              : !fbReady
                ? "Cargando SDK…"
                : "Conectar número de WhatsApp"}
        </button>

        <p className="text-xs text-muted-foreground">
          Conectás un número por vez. Después le asignás un producto desde el dashboard.
        </p>
      </div>
    </>
  )
}
