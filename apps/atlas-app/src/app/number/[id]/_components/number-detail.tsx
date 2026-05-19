"use client"

import { useState, useEffect, useTransition } from "react"
import { useRouter } from "next/navigation"
import type { PhoneNumber, EventLogEntry, Product } from "@/lib/db/schema"

type Row = Omit<PhoneNumber, "connectedAt" | "lastActivityAt" | "createdAt" | "updatedAt"> & {
  connectedAt: string | null
  lastActivityAt: string | null
  createdAt: string
  updatedAt: string
}

type EventRow = Omit<EventLogEntry, "createdAt"> & { createdAt: string }

type Tab = "overview" | "activity" | "actions"

const TAB_LABELS: Record<Tab, string> = {
  overview: "Resumen",
  activity: "Actividad",
  actions: "Acciones",
}

const QUALITY_STYLES: Record<string, string> = {
  GREEN: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  YELLOW: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  RED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  UNKNOWN: "bg-muted text-muted-foreground",
}

const QUALITY_LABELS: Record<string, string> = {
  GREEN: "Verde",
  YELLOW: "Amarillo",
  RED: "Rojo",
  UNKNOWN: "Sin datos",
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  paused: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  disconnected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  banned: "bg-zinc-800 text-zinc-200",
}

const STATUS_LABELS: Record<string, string> = {
  active: "Activo",
  paused: "Pausado",
  disconnected: "Desconectado",
  banned: "Baneado",
}

const EVENT_LABELS: Record<string, string> = {
  connected: "Conectado",
  product_changed: "Producto cambiado",
  quality_dropped: "Calidad bajó",
  paused: "Pausado",
  activated: "Reactivado",
  disconnected: "Desconectado",
}

const TIER_LABELS: Record<string, string> = {
  TIER_250: "250/día",
  TIER_1K: "1K/día",
  TIER_10K: "10K/día",
  TIER_100K: "100K/día",
  TIER_UNLIMITED: "∞",
}

function formatDate(s: string | null): string {
  if (!s) return "—"
  return new Date(s).toLocaleString("es-AR", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  })
}

function Badge({ label, style }: { label: string; style: string }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${style}`}>{label}</span>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2 py-2 border-b last:border-0">
      <span className="text-sm text-muted-foreground w-40 shrink-0">{label}</span>
      <span className="text-sm font-mono break-all">{value ?? "—"}</span>
    </div>
  )
}

export function NumberDetail({
  initialNumber,
  initialEvents,
  products,
}: {
  initialNumber: PhoneNumber
  initialEvents: EventLogEntry[]
  products: Product[]
}) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>("overview")
  const [number, setNumber] = useState<Row>(initialNumber as unknown as Row)
  const [events, setEvents] = useState<EventRow[]>(initialEvents as unknown as EventRow[])
  const [isPending, startTransition] = useTransition()
  const [actionError, setActionError] = useState("")
  const [selectedProductId, setSelectedProductId] = useState("")
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)

  // Sync when server re-renders after router.refresh()
  useEffect(() => {
    setNumber(initialNumber as unknown as Row)
  }, [initialNumber])
  useEffect(() => {
    setEvents(initialEvents as unknown as EventRow[])
  }, [initialEvents])

  async function callAction(
    path: string,
    body?: Record<string, unknown>
  ): Promise<Row | null> {
    setActionError("")
    const res = await fetch(`/api/numbers/${number.id}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await res.json() as Row & { error?: string }
    if (!res.ok) {
      setActionError(data.error ?? "Error inesperado")
      return null
    }
    return data
  }

  function handlePause() {
    startTransition(async () => {
      const updated = await callAction("pause")
      if (updated) {
        setNumber(updated)
        router.refresh()
      }
    })
  }

  function handleChangeProduct() {
    if (!selectedProductId) return
    startTransition(async () => {
      const updated = await callAction("change-product", { productId: selectedProductId })
      if (updated) {
        setNumber(updated)
        setSelectedProductId("")
        router.refresh()
      }
    })
  }

  function handleDisconnect() {
    startTransition(async () => {
      const updated = await callAction("disconnect")
      if (updated) {
        setNumber(updated)
        setConfirmDisconnect(false)
        router.refresh()
      }
    })
  }

  const canAct = number.status !== "disconnected" && number.status !== "banned"

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="flex-1 space-y-1">
          <p className="text-2xl font-mono font-semibold">{number.phoneNumber}</p>
          {number.displayName && (
            <p className="text-muted-foreground">{number.displayName}</p>
          )}
          {number.internalLabel && (
            <p className="text-xs text-muted-foreground">{number.internalLabel}</p>
          )}
        </div>
        <div className="flex flex-col gap-1.5 items-end">
          <Badge
            label={QUALITY_LABELS[number.qualityRating] ?? number.qualityRating}
            style={QUALITY_STYLES[number.qualityRating] ?? QUALITY_STYLES.UNKNOWN}
          />
          <Badge
            label={STATUS_LABELS[number.status] ?? number.status}
            style={STATUS_STYLES[number.status] ?? "bg-muted text-muted-foreground"}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b flex">
        {(["overview", "activity", "actions"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* ── Resumen ──────────────────────────────────────────────────────────── */}
      {activeTab === "overview" && (
        <div className="rounded-lg border bg-card px-4 divide-y divide-border">
          <InfoRow label="Número" value={number.phoneNumber} />
          <InfoRow label="Nombre visible" value={number.displayName} />
          <InfoRow label="Producto" value={number.productName ?? number.productSlug} />
          <InfoRow label="Calidad" value={
            <Badge
              label={QUALITY_LABELS[number.qualityRating] ?? number.qualityRating}
              style={QUALITY_STYLES[number.qualityRating] ?? QUALITY_STYLES.UNKNOWN}
            />
          } />
          <InfoRow
            label="Tier de mensajería"
            value={TIER_LABELS[number.messagingTier ?? ""] ?? number.messagingTier}
          />
          <InfoRow label="Estado" value={
            <Badge
              label={STATUS_LABELS[number.status] ?? number.status}
              style={STATUS_STYLES[number.status] ?? ""}
            />
          } />
          <InfoRow label="Meta App usada" value={number.metaAppUsed} />
          <InfoRow label="WABA ID" value={number.wabaId} />
          <InfoRow label="Phone Number ID" value={number.phoneNumberId} />
          <InfoRow label="Instancia Evolution" value={number.evolutionInstanceName} />
          <InfoRow label="Inbox Chatwoot" value={number.chatwootInboxId?.toString()} />
          <InfoRow label="Typebot ID" value={number.typebotId} />
          <InfoRow label="Conectado" value={formatDate(number.connectedAt)} />
          <InfoRow label="Última actividad" value={formatDate(number.lastActivityAt)} />
          <InfoRow label="Actualizado" value={formatDate(number.updatedAt)} />
        </div>
      )}

      {/* ── Actividad ────────────────────────────────────────────────────────── */}
      {activeTab === "activity" && (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                  Fecha
                </th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                  Evento
                </th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">
                  Datos
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                    {formatDate(e.createdAt)}
                  </td>
                  <td className="px-4 py-2.5">
                    {EVENT_LABELS[e.eventType] ?? e.eventType}
                  </td>
                  <td className="px-4 py-2.5 hidden md:table-cell">
                    {e.data ? (
                      <code className="text-xs text-muted-foreground">
                        {JSON.stringify(e.data)}
                      </code>
                    ) : null}
                  </td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                    Sin actividad registrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Acciones ─────────────────────────────────────────────────────────── */}
      {activeTab === "actions" && (
        <div className="space-y-4">
          {actionError && (
            <p className="text-destructive text-sm">{actionError}</p>
          )}

          {/* Pausar / Activar */}
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <div>
              <p className="font-medium text-sm">
                {number.status === "paused" ? "Reactivar" : "Pausar"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {number.status === "paused"
                  ? "Reactiva la recepción de mensajes."
                  : "Suspende mensajes sin desconectar el número de Meta."}
              </p>
            </div>
            <button
              onClick={handlePause}
              disabled={!canAct || isPending}
              className="rounded border border-input px-4 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
            >
              {isPending
                ? "…"
                : number.status === "paused"
                  ? "Reactivar"
                  : "Pausar"}
            </button>
          </div>

          {/* Cambiar producto */}
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <div>
              <p className="font-medium text-sm">Cambiar producto</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Aplica a conversaciones futuras. Actual:{" "}
                <span className="font-medium">
                  {number.productName ?? number.productSlug ?? "—"}
                </span>
              </p>
            </div>
            <div className="flex gap-2">
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                disabled={!canAct || isPending}
                className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
              >
                <option value="">Seleccionar producto…</option>
                {products
                  .filter((p) => p.active && p.slug !== number.productSlug)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
              <button
                onClick={handleChangeProduct}
                disabled={!canAct || !selectedProductId || isPending}
                className="rounded bg-primary text-primary-foreground px-4 py-1.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {isPending ? "…" : "Guardar"}
              </button>
            </div>
          </div>

          {/* Reconectar */}
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <div>
              <p className="font-medium text-sm">Reconectar</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Re-autoriza el número con Meta Embedded Signup.
              </p>
            </div>
            <a
              href="/connect"
              className="inline-block rounded border border-input px-4 py-1.5 text-sm hover:bg-muted"
            >
              Ir a Conectar
            </a>
          </div>

          {/* Desconectar */}
          <div className="rounded-lg border border-destructive/30 bg-card p-4 space-y-3">
            <div>
              <p className="font-medium text-sm text-destructive">Desconectar</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Elimina la instancia de Evolution y archiva el número. No elimina
                el número en Meta.
              </p>
            </div>

            {confirmDisconnect ? (
              <div className="space-y-2">
                <p className="text-sm">
                  ¿Confirmar desconexión de{" "}
                  <span className="font-mono">{number.phoneNumber}</span>?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleDisconnect}
                    disabled={isPending}
                    className="rounded bg-destructive text-destructive-foreground px-4 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
                  >
                    {isPending ? "…" : "Sí, desconectar"}
                  </button>
                  <button
                    onClick={() => setConfirmDisconnect(false)}
                    className="rounded border border-input px-4 py-1.5 text-sm hover:bg-muted"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDisconnect(true)}
                disabled={number.status === "disconnected" || isPending}
                className="rounded border border-destructive/50 text-destructive px-4 py-1.5 text-sm hover:bg-destructive/10 disabled:opacity-50"
              >
                Desconectar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
