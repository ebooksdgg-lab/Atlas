"use client"

import { useState, useTransition } from "react"
import { createProduct, updateProduct, deleteProduct } from "../actions"
import type { Product } from "@/lib/db/schema"

export function ProductsSection({ products }: { products: Product[] }) {
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  function handleCreate(formData: FormData) {
    setError("")
    startTransition(async () => {
      const result = await createProduct(formData)
      if (result.ok) {
        setShowCreate(false)
      } else {
        setError(result.error)
      }
    })
  }

  function handleUpdate(id: string, formData: FormData) {
    setError("")
    startTransition(async () => {
      const result = await updateProduct(id, formData)
      if (result.ok) {
        setEditingId(null)
      } else {
        setError(result.error)
      }
    })
  }

  function handleDelete(id: string) {
    if (!confirm("¿Eliminar este producto?")) return
    setError("")
    startTransition(async () => {
      const result = await deleteProduct(id)
      if (!result.ok) setError(result.error)
    })
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium">Productos</h2>
        {!showCreate && (
          <button
            onClick={() => { setShowCreate(true); setError("") }}
            className="rounded bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:bg-primary/90"
          >
            + Nuevo
          </button>
        )}
      </div>

      {error && <p className="text-destructive text-sm mb-3">{error}</p>}

      {showCreate && (
        <div className="rounded-lg border bg-card p-4 mb-4">
          <p className="text-sm font-medium mb-3">Nuevo producto</p>
          <ProductForm
            onSubmit={handleCreate}
            onCancel={() => { setShowCreate(false); setError("") }}
            isPending={isPending}
          />
        </div>
      )}

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Slug</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Nombre</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Typebot ID</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Estado</th>
              <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {products.map((p) =>
              editingId === p.id ? (
                <tr key={p.id}>
                  <td colSpan={5} className="px-4 py-3">
                    <ProductForm
                      defaultValues={p}
                      onSubmit={(fd) => handleUpdate(p.id, fd)}
                      onCancel={() => { setEditingId(null); setError("") }}
                      isPending={isPending}
                    />
                  </td>
                </tr>
              ) : (
                <tr key={p.id}>
                  <td className="px-4 py-2.5 font-mono text-xs">{p.slug}</td>
                  <td className="px-4 py-2.5">{p.name}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                    {p.typebotId ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    {p.active ? (
                      <span className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 rounded-full">
                        Activo
                      </span>
                    ) : (
                      <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                        Inactivo
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right space-x-3">
                    <button
                      onClick={() => { setEditingId(p.id); setError("") }}
                      className="text-xs text-muted-foreground hover:text-foreground hover:underline underline-offset-2"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      disabled={isPending}
                      className="text-xs text-destructive hover:opacity-80 hover:underline underline-offset-2 disabled:opacity-50"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              )
            )}
            {products.length === 0 && !showCreate && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                  Sin productos. Creá uno para empezar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function ProductForm({
  defaultValues,
  onSubmit,
  onCancel,
  isPending,
}: {
  defaultValues?: Pick<Product, "slug" | "name" | "typebotId"> | null
  onSubmit: (formData: FormData) => void
  onCancel: () => void
  isPending: boolean
}) {
  return (
    <form action={onSubmit} className="flex flex-wrap gap-2 items-end">
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Slug *</label>
        <input
          name="slug"
          defaultValue={defaultValues?.slug}
          placeholder="sibo"
          required
          pattern="[a-z0-9-]+"
          title="Solo letras minúsculas, números y guiones"
          className="rounded border border-input bg-background px-2 py-1.5 text-sm font-mono w-28 focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Nombre *</label>
        <input
          name="name"
          defaultValue={defaultValues?.name}
          placeholder="SIBO"
          required
          className="rounded border border-input bg-background px-2 py-1.5 text-sm w-36 focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Typebot ID</label>
        <input
          name="typebotId"
          defaultValue={defaultValues?.typebotId ?? ""}
          placeholder="flow_abc123"
          className="rounded border border-input bg-background px-2 py-1.5 text-sm font-mono w-40 focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          {isPending ? "…" : "Guardar"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-input px-3 py-1.5 text-sm hover:bg-muted"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}
