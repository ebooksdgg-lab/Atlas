"use client"

import { useState, useTransition } from "react"
import { activateMetaApp, upsertMetaApp } from "../actions"

type AppDisplay = {
  id: string
  appId: string
  configId: string
  isActive: boolean
  notes: string | null
  hasSecret: boolean
}

export function MetaAppsSection({ apps }: { apps: AppDisplay[] }) {
  const appMap = Object.fromEntries(apps.map((a) => [a.id, a]))
  return (
    <section>
      <h2 className="text-lg font-medium mb-4">Meta Apps</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        {(["app_1", "app_2", "app_3"] as const).map((id) => (
          <MetaAppCard key={id} id={id} app={appMap[id] ?? null} />
        ))}
      </div>
    </section>
  )
}

function MetaAppCard({ id, app }: { id: string; app: AppDisplay | null }) {
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  function handleActivate() {
    setError("")
    startTransition(async () => {
      const result = await activateMetaApp(id)
      if (!result.ok) setError(result.error)
    })
  }

  function handleSubmit(formData: FormData) {
    setError("")
    startTransition(async () => {
      const result = await upsertMetaApp(id, formData)
      if (result.ok) {
        setEditing(false)
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-mono font-medium">{id}</span>
        {app?.isActive ? (
          <span className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 rounded-full">
            Activa
          </span>
        ) : (
          <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
            Inactiva
          </span>
        )}
      </div>

      {/* Info */}
      {app ? (
        <div className="space-y-1 text-sm">
          <p className="text-muted-foreground">
            App ID:{" "}
            <span className="font-mono text-foreground">
              {app.appId.length > 12 ? `${app.appId.slice(0, 12)}…` : app.appId}
            </span>
          </p>
          <p className="text-muted-foreground">
            Config ID:{" "}
            <span className="font-mono text-foreground">
              {app.configId.length > 12 ? `${app.configId.slice(0, 12)}…` : app.configId}
            </span>
          </p>
          <p className="text-muted-foreground">
            Secret:{" "}
            <span className="text-foreground">
              {app.hasSecret ? "••••••••" : "no configurado"}
            </span>
          </p>
          {app.notes && (
            <p className="text-xs text-muted-foreground">{app.notes}</p>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Sin configurar</p>
      )}

      {/* Edit form */}
      {editing && (
        <form action={handleSubmit} className="space-y-2 pt-2 border-t">
          <input
            name="appId"
            placeholder="App ID *"
            defaultValue={app?.appId ?? ""}
            required
            className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <input
            name="appSecret"
            type="password"
            placeholder={app?.hasSecret ? "Secret (vacío = no cambiar)" : "App Secret *"}
            autoComplete="off"
            className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <input
            name="configId"
            placeholder="Config ID *"
            defaultValue={app?.configId ?? ""}
            required
            className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <input
            name="notes"
            placeholder="Notas (opcional)"
            defaultValue={app?.notes ?? ""}
            className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {error && <p className="text-destructive text-xs">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 rounded bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {isPending ? "Guardando…" : "Guardar"}
            </button>
            <button
              type="button"
              onClick={() => { setEditing(false); setError("") }}
              className="flex-1 rounded border border-input px-3 py-1.5 text-xs hover:bg-muted"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Actions */}
      {!editing && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => { setEditing(true); setError("") }}
            className="flex-1 rounded border border-input px-3 py-1.5 text-xs hover:bg-muted"
          >
            Editar
          </button>
          {app && !app.isActive && (
            <button
              onClick={handleActivate}
              disabled={isPending}
              className="flex-1 rounded bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {isPending ? "…" : "Activar"}
            </button>
          )}
        </div>
      )}

      {error && !editing && <p className="text-destructive text-xs">{error}</p>}
    </div>
  )
}
