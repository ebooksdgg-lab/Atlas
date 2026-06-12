"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import type { PhoneNumber } from "@/lib/db/schema"

// The encrypted token is never sent to the client — both the dashboard query and
// /api/numbers omit it. Dates become ISO strings across the Server → Client boundary.
type PhoneNumberRow = Omit<
  PhoneNumber,
  "accessTokenEncrypted" | "connectedAt" | "lastActivityAt" | "createdAt" | "updatedAt"
> & {
  connectedAt: string | null
  lastActivityAt: string | null
  createdAt: string
  updatedAt: string
}

type ProductOption = { id: string; slug: string; name: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TIER_LABELS: Record<string, string> = {
  TIER_250: "250/día",
  TIER_1K: "1K/día",
  TIER_10K: "10K/día",
  TIER_100K: "100K/día",
  TIER_UNLIMITED: "∞",
}

function formatTier(tier: string | null): string {
  if (!tier) return "—"
  return TIER_LABELS[tier] ?? tier
}

function formatRelative(dateStr: string | Date | null): string {
  if (!dateStr) return "—"
  const d = typeof dateStr === "string" ? new Date(dateStr) : dateStr
  if (isNaN(d.getTime())) return "—"
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60_000)
  if (diffMin < 2) return "recién"
  if (diffMin < 60) return `${diffMin} min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH} h`
  return `${Math.floor(diffH / 24)} d`
}

function formatClock(d: Date): string {
  return d.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

function QualityBadge({ rating }: { rating: string }) {
  const styles: Record<string, string> = {
    GREEN: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    YELLOW: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    RED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    UNKNOWN: "bg-muted text-muted-foreground",
  }
  const labels: Record<string, string> = {
    GREEN: "Verde",
    YELLOW: "Amarillo",
    RED: "Rojo",
    UNKNOWN: "—",
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${styles[rating] ?? styles.UNKNOWN}`}>
      {labels[rating] ?? rating}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    unassigned: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    paused: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    disconnected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    banned: "bg-zinc-800 text-zinc-200",
  }
  const labels: Record<string, string> = {
    unassigned: "Sin asignar",
    active: "Activo",
    paused: "Pausado",
    disconnected: "Desconectado",
    banned: "Baneado",
  }
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full ${styles[status] ?? "bg-muted text-muted-foreground"}`}
    >
      {labels[status] ?? status}
    </span>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function NumbersTable({
  initialRows,
  products,
}: {
  initialRows: Omit<PhoneNumber, "accessTokenEncrypted">[]
  products: ProductOption[]
}) {
  const router = useRouter()
  const [rows, setRows] = useState<PhoneNumberRow[]>(
    initialRows as unknown as PhoneNumberRow[]
  )
  const [filterBM, setFilterBM] = useState("all")
  const [filterProduct, setFilterProduct] = useState("all")
  const [filterStatus, setFilterStatus] = useState("all")
  const [filterQuality, setFilterQuality] = useState("all")
  const [lastUpdated, setLastUpdated] = useState(new Date())
  const [refreshing, setRefreshing] = useState(false)
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [assignError, setAssignError] = useState<string | null>(null)

  const slugToId = useMemo(
    () => Object.fromEntries(products.map((p) => [p.slug, p.id])),
    [products]
  )

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await fetch("/api/numbers")
      if (res.ok) {
        setRows((await res.json()) as PhoneNumberRow[])
        setLastUpdated(new Date())
      }
    } finally {
      setRefreshing(false)
    }
  }, [])

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(refresh, 30_000)
    return () => clearInterval(interval)
  }, [refresh])

  async function handleAssign(id: string, productId: string) {
    if (!productId) return
    setAssigningId(id)
    setAssignError(null)
    try {
      const res = await fetch(`/api/numbers/${id}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      })
      if (!res.ok) {
        const err = (await res.json()) as { error?: string }
        setAssignError(err.error ?? "Error al asignar el producto.")
      } else {
        await refresh()
      }
    } catch (e) {
      setAssignError(e instanceof Error ? e.message : "Error de red al asignar.")
    } finally {
      setAssigningId(null)
    }
  }

  const stats = useMemo(
    () => ({
      total: rows.length,
      unassigned: rows.filter((r) => r.status === "unassigned").length,
      healthy: rows.filter((r) => r.status === "active" && r.qualityRating === "GREEN").length,
      warning: rows.filter((r) => r.status === "active" && r.qualityRating === "YELLOW").length,
      critical: rows.filter((r) => r.status === "active" && r.qualityRating === "RED").length,
      down: rows.filter((r) => r.status === "disconnected" || r.status === "banned").length,
    }),
    [rows]
  )

  const bmOptions = useMemo(() => {
    const seen = new Set<string>()
    for (const r of rows) {
      if (r.businessName) seen.add(r.businessName)
    }
    return Array.from(seen).sort()
  }, [rows])

  const productOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const r of rows) {
      if (r.productSlug && !seen.has(r.productSlug)) {
        seen.set(r.productSlug, r.productName ?? r.productSlug)
      }
    }
    return Array.from(seen.entries()).map(([slug, name]) => ({ slug, name }))
  }, [rows])

  const filteredRows = useMemo(
    () =>
      rows.filter((r) => {
        if (filterBM !== "all" && r.businessName !== filterBM) return false
        if (filterProduct === "__unassigned__") {
          if (r.productSlug) return false
        } else if (filterProduct !== "all" && r.productSlug !== filterProduct) {
          return false
        }
        if (filterStatus !== "all" && r.status !== filterStatus) return false
        if (filterQuality !== "all" && r.qualityRating !== filterQuality) return false
        return true
      }),
    [rows, filterBM, filterProduct, filterStatus, filterQuality]
  )

  const selectClass =
    "rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="flex flex-wrap gap-3">
        {[
          { label: "Total", value: stats.total, color: "" },
          { label: "Sin asignar", value: stats.unassigned, color: "text-blue-600 dark:text-blue-400" },
          { label: "Verde", value: stats.healthy, color: "text-green-600 dark:text-green-400" },
          { label: "Amarillo", value: stats.warning, color: "text-yellow-600 dark:text-yellow-400" },
          { label: "Rojo", value: stats.critical, color: "text-red-600 dark:text-red-400" },
          { label: "Caídos", value: stats.down, color: "text-muted-foreground" },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="flex items-baseline gap-1.5 rounded-lg border bg-card px-4 py-2"
          >
            <span className={`text-xl font-semibold ${color}`}>{value}</span>
            <span className="text-xs text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>

      {/* Filters + refresh */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={filterBM} onChange={(e) => setFilterBM(e.target.value)} className={selectClass}>
          <option value="all">Todos los BM</option>
          {bmOptions.map((bm) => (
            <option key={bm} value={bm}>
              {bm}
            </option>
          ))}
        </select>

        <select
          value={filterProduct}
          onChange={(e) => setFilterProduct(e.target.value)}
          className={selectClass}
        >
          <option value="all">Todos los productos</option>
          <option value="__unassigned__">Sin asignar</option>
          {productOptions.map(({ slug, name }) => (
            <option key={slug} value={slug}>
              {name}
            </option>
          ))}
        </select>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className={selectClass}
        >
          <option value="all">Todos los estados</option>
          <option value="unassigned">Sin asignar</option>
          <option value="active">Activo</option>
          <option value="paused">Pausado</option>
          <option value="disconnected">Desconectado</option>
          <option value="banned">Baneado</option>
        </select>

        <select
          value={filterQuality}
          onChange={(e) => setFilterQuality(e.target.value)}
          className={selectClass}
        >
          <option value="all">Toda calidad</option>
          <option value="GREEN">Verde</option>
          <option value="YELLOW">Amarillo</option>
          <option value="RED">Rojo</option>
          <option value="UNKNOWN">Sin datos</option>
        </select>

        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-muted-foreground hidden sm:block">
            {formatClock(lastUpdated)}
          </span>
          <button
            onClick={refresh}
            disabled={refreshing}
            className="rounded border border-input px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
          >
            {refreshing ? "…" : "↻ Actualizar"}
          </button>
        </div>
      </div>

      {assignError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2">
          <p className="text-destructive text-sm">{assignError}</p>
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Número</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden lg:table-cell">
                Business Manager
              </th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Producto</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Calidad</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">
                Tier
              </th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Estado</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">
                Última act.
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredRows.map((r) => (
              <tr
                key={r.id}
                onClick={() => router.push(`/number/${r.id}`)}
                className="cursor-pointer hover:bg-muted/40 transition-colors"
              >
                <td className="px-4 py-3">
                  <p className="font-mono text-xs">{r.phoneNumber}</p>
                  {r.internalLabel && (
                    <p className="text-xs text-muted-foreground mt-0.5">{r.internalLabel}</p>
                  )}
                </td>
                <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">
                  {r.businessName ?? "—"}
                </td>
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <select
                    value={r.productSlug ? (slugToId[r.productSlug] ?? "") : ""}
                    onChange={(e) => handleAssign(r.id, e.target.value)}
                    disabled={assigningId === r.id || products.length === 0}
                    className="rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                  >
                    <option value="">
                      {assigningId === r.id ? "Asignando…" : "Asignar…"}
                    </option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <QualityBadge rating={r.qualityRating} />
                </td>
                <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">
                  {formatTier(r.messagingTier)}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={r.status} />
                </td>
                <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                  {formatRelative(r.lastActivityAt)}
                </td>
              </tr>
            ))}

            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  {rows.length === 0
                    ? "Sin números conectados. Hacé clic en + Conectar número para empezar."
                    : "Sin resultados para los filtros aplicados."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {filteredRows.length > 0 && filteredRows.length !== rows.length && (
        <p className="text-xs text-muted-foreground text-right">
          Mostrando {filteredRows.length} de {rows.length}
        </p>
      )}
    </div>
  )
}
