import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { numbers, products, eventLog } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { setTypebot, disableTypebot } from "@/lib/evolution"
import { ensureLabel } from "@/lib/chatwoot"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const { productId } = (await req.json()) as { productId?: string }

  if (!productId) return NextResponse.json({ error: "productId is required" }, { status: 400 })

  const [[number], [newProduct]] = await Promise.all([
    db.select().from(numbers).where(eq(numbers.id, id)).limit(1),
    db.select().from(products).where(eq(products.id, productId)).limit(1),
  ])

  if (!number) return NextResponse.json({ error: "Number not found" }, { status: 404 })
  if (!newProduct) return NextResponse.json({ error: "Product not found" }, { status: 404 })
  if (!newProduct.active)
    return NextResponse.json({ error: "El producto está inactivo" }, { status: 422 })
  if (number.productSlug === newProduct.slug)
    return NextResponse.json({ error: "El número ya usa ese producto" }, { status: 422 })

  const typebotViewerUrl =
    process.env.TYPEBOT_VIEWER_URL ?? "http://typebot-viewer:3000"

  // Update Evolution Typebot config (best effort for each)
  if (number.evolutionInstanceName) {
    if (newProduct.typebotId) {
      try {
        await setTypebot({
          instanceName: number.evolutionInstanceName,
          viewerUrl: typebotViewerUrl,
          typebotId: newProduct.typebotId,
        })
      } catch (e) {
        console.error("[change-product] Evolution Typebot error:", e)
      }
    } else {
      await disableTypebot(number.evolutionInstanceName)
    }
  }

  // Ensure new product label exists in Chatwoot (non-fatal)
  await ensureLabel(`producto-${newProduct.slug}`)

  const now = new Date()
  const [updated] = await db
    .update(numbers)
    .set({
      productSlug: newProduct.slug,
      productName: newProduct.name,
      typebotId: newProduct.typebotId ?? null,
      updatedAt: now,
    })
    .where(eq(numbers.id, id))
    .returning()

  await db.insert(eventLog).values({
    numberId: id,
    eventType: "product_changed",
    data: {
      from: { slug: number.productSlug, name: number.productName },
      to: { slug: newProduct.slug, name: newProduct.name },
    },
  })

  return NextResponse.json(updated)
}
