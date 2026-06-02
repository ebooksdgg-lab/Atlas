"use server"

import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { metaApps, products, numbers } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { encrypt } from "@/lib/crypto"
import { revalidatePath } from "next/cache"
import { z } from "zod"

export type ActionResult = { ok: true } | { ok: false; error: string }

async function requireAdmin(): Promise<void> {
  const session = await getServerSession(authOptions)
  if (!session?.user) throw new Error("No autenticado")
}

// ─── Meta Apps ────────────────────────────────────────────────────────────────

export async function activateMetaApp(id: string): Promise<ActionResult> {
  try {
    await requireAdmin()
    await db.update(metaApps).set({ isActive: false })
    await db.update(metaApps).set({ isActive: true }).where(eq(metaApps.id, id))
    revalidatePath("/settings")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error inesperado" }
  }
}

export async function upsertMetaApp(id: string, formData: FormData): Promise<ActionResult> {
  try {
    await requireAdmin()

    const appId = (formData.get("appId") as string | null)?.trim() ?? ""
    const configId = (formData.get("configId") as string | null)?.trim() || null
    const rawSecret = (formData.get("appSecret") as string | null)?.trim() ?? ""
    const notes = (formData.get("notes") as string | null)?.trim() || null

    if (!appId) return { ok: false, error: "App ID es requerido" }

    let appSecretEncrypted: string
    if (rawSecret) {
      appSecretEncrypted = encrypt(rawSecret)
    } else {
      const [existing] = await db
        .select({ s: metaApps.appSecretEncrypted })
        .from(metaApps)
        .where(eq(metaApps.id, id))
        .limit(1)
      if (!existing?.s) return { ok: false, error: "App Secret es requerido para una app nueva" }
      appSecretEncrypted = existing.s
    }

    await db
      .insert(metaApps)
      .values({ id, appId, appSecretEncrypted, configId, isActive: false, notes })
      .onConflictDoUpdate({
        target: metaApps.id,
        set: { appId, appSecretEncrypted, configId, notes },
      })

    revalidatePath("/settings")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error inesperado" }
  }
}

// ─── Products ─────────────────────────────────────────────────────────────────

const productSchema = z.object({
  slug: z
    .string()
    .min(1, "Slug requerido")
    .regex(/^[a-z0-9-]+$/, "Solo letras minúsculas, números y guiones"),
  name: z.string().min(1, "Nombre requerido"),
  typebotId: z.string().optional(),
})

function parseProductForm(formData: FormData) {
  return productSchema.safeParse({
    slug: formData.get("slug"),
    name: formData.get("name"),
    typebotId: (formData.get("typebotId") as string) || undefined,
  })
}

export async function createProduct(formData: FormData): Promise<ActionResult> {
  try {
    await requireAdmin()
    const parsed = parseProductForm(formData)
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

    await db.insert(products).values({
      slug: parsed.data.slug,
      name: parsed.data.name,
      typebotId: parsed.data.typebotId ?? null,
      active: true,
    })

    revalidatePath("/settings")
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error inesperado"
    if (msg.toLowerCase().includes("unique")) return { ok: false, error: "El slug ya existe" }
    return { ok: false, error: msg }
  }
}

export async function updateProduct(id: string, formData: FormData): Promise<ActionResult> {
  try {
    await requireAdmin()
    const parsed = parseProductForm(formData)
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

    await db
      .update(products)
      .set({
        slug: parsed.data.slug,
        name: parsed.data.name,
        typebotId: parsed.data.typebotId ?? null,
      })
      .where(eq(products.id, id))

    revalidatePath("/settings")
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error inesperado"
    if (msg.toLowerCase().includes("unique")) return { ok: false, error: "El slug ya existe" }
    return { ok: false, error: msg }
  }
}

export async function deleteProduct(id: string): Promise<ActionResult> {
  try {
    await requireAdmin()

    const [product] = await db
      .select({ slug: products.slug })
      .from(products)
      .where(eq(products.id, id))
      .limit(1)

    if (!product) return { ok: false, error: "Producto no encontrado" }

    const [inUse] = await db
      .select({ id: numbers.id })
      .from(numbers)
      .where(eq(numbers.productSlug, product.slug))
      .limit(1)

    if (inUse) {
      return {
        ok: false,
        error: "Este producto tiene números asignados. Reasignálos antes de eliminar.",
      }
    }

    await db.delete(products).where(eq(products.id, id))
    revalidatePath("/settings")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error inesperado" }
  }
}
