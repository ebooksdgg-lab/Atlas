import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { numbers, products, eventLog } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { decrypt } from "@/lib/crypto"
import { createCloudInstance, deleteInstance, setTypebot, disableTypebot } from "@/lib/evolution"
import { createWhatsAppInbox, ensureLabel } from "@/lib/chatwoot"

/**
 * Assign a product to an imported number.
 *
 * First assignment (status `unassigned`): provisions the Evolution instance +
 * Chatwoot inbox + Typebot binding using the number's own stored OAuth token
 * (each Meta profile has its own token), then flips the number to `active`.
 *
 * Reassignment (already provisioned): only rebinds the Typebot.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const { productId } = (await req.json()) as { productId?: string }
  if (!productId) return NextResponse.json({ error: "productId is required" }, { status: 400 })

  const [[number], [product]] = await Promise.all([
    db.select().from(numbers).where(eq(numbers.id, id)).limit(1),
    db.select().from(products).where(eq(products.id, productId)).limit(1),
  ])

  if (!number) return NextResponse.json({ error: "Number not found" }, { status: 404 })
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 })
  if (!product.active)
    return NextResponse.json({ error: "El producto está inactivo" }, { status: 422 })

  const typebotViewerUrl = process.env.TYPEBOT_VIEWER_URL ?? "http://typebot-viewer:3000"
  const now = new Date()

  // ── Reassignment: instance already exists, just rebind the Typebot ──────────
  if (number.evolutionInstanceName) {
    if (number.productSlug === product.slug)
      return NextResponse.json({ error: "El número ya usa ese producto" }, { status: 422 })

    if (product.typebotId) {
      try {
        await setTypebot({
          instanceName: number.evolutionInstanceName,
          viewerUrl: typebotViewerUrl,
          typebotId: product.typebotId,
        })
      } catch (e) {
        console.error("[assign] rebind Typebot error:", e)
      }
    } else {
      await disableTypebot(number.evolutionInstanceName)
    }

    await ensureLabel(`producto-${product.slug}`)

    const [updated] = await db
      .update(numbers)
      .set({
        productSlug: product.slug,
        productName: product.name,
        typebotId: product.typebotId ?? null,
        updatedAt: now,
      })
      .where(eq(numbers.id, id))
      .returning()

    await db.insert(eventLog).values({
      numberId: id,
      eventType: "product_changed",
      data: {
        from: { slug: number.productSlug, name: number.productName },
        to: { slug: product.slug, name: product.name },
      },
    })

    return NextResponse.json(updated)
  }

  // ── First assignment: provision everything ──────────────────────────────────
  if (!number.phoneNumberId || !number.wabaId || !number.accessTokenEncrypted) {
    return NextResponse.json(
      { error: "El número no tiene credenciales de Meta. Reimportá el perfil." },
      { status: 422 }
    )
  }

  let accessToken: string
  try {
    accessToken = decrypt(number.accessTokenEncrypted)
  } catch {
    return NextResponse.json(
      { error: "No se pudo descifrar el token del número. Reimportá el perfil." },
      { status: 500 }
    )
  }

  const cleanPhone = number.phoneNumber.replace(/[^0-9]/g, "")
  const instanceName = `atlas-${cleanPhone}`

  // 1. Evolution Cloud API instance
  let evoInstance: { instanceName: string }
  try {
    evoInstance = await createCloudInstance({
      instanceName,
      phoneNumber: cleanPhone,
      wabaId: number.wabaId,
      phoneNumberId: number.phoneNumberId,
      accessToken,
    })
  } catch (e) {
    console.error("[assign] Evolution error:", e)
    return NextResponse.json(
      { error: "Evolution API error: " + (e instanceof Error ? e.message : String(e)) },
      { status: 502 }
    )
  }

  // 2. Typebot binding
  if (product.typebotId) {
    try {
      await setTypebot({
        instanceName: evoInstance.instanceName,
        viewerUrl: typebotViewerUrl,
        typebotId: product.typebotId,
      })
    } catch (e) {
      console.error("[assign] Typebot setup error:", e)
      await deleteInstance(evoInstance.instanceName)
      return NextResponse.json(
        { error: "Typebot setup error: " + (e instanceof Error ? e.message : String(e)) },
        { status: 502 }
      )
    }
  }

  // 3. Chatwoot inbox
  let chatwootInboxId: number | null = null
  try {
    const inbox = await createWhatsAppInbox({
      name: `${number.displayName ?? cleanPhone} — ${product.name}`,
      phoneNumber: `+${cleanPhone}`,
      accessToken,
      phoneNumberId: number.phoneNumberId,
      wabaId: number.wabaId,
    })
    chatwootInboxId = inbox.id
    await ensureLabel(`producto-${product.slug}`)
  } catch (e) {
    console.error("[assign] Chatwoot error:", e)
    await deleteInstance(evoInstance.instanceName)
    return NextResponse.json(
      { error: "Chatwoot error: " + (e instanceof Error ? e.message : String(e)) },
      { status: 502 }
    )
  }

  // 4. Flip to active + persist binding
  const [updated] = await db
    .update(numbers)
    .set({
      productSlug: product.slug,
      productName: product.name,
      typebotId: product.typebotId ?? null,
      status: "active",
      evolutionInstanceName: evoInstance.instanceName,
      chatwootInboxId,
      connectedAt: now,
      lastActivityAt: now,
      updatedAt: now,
    })
    .where(eq(numbers.id, id))
    .returning()

  await db.insert(eventLog).values({
    numberId: id,
    eventType: "connected",
    data: {
      productSlug: product.slug,
      instanceName: evoInstance.instanceName,
      chatwootInboxId,
    },
  })

  return NextResponse.json(updated)
}
