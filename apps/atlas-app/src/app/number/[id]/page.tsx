import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { db } from "@/lib/db"
import { numbers, eventLog, products } from "@/lib/db/schema"
import { eq, desc } from "drizzle-orm"
import { numberPublicColumns } from "@/lib/db/columns"
import { NumberDetail } from "./_components/number-detail"

export default async function NumberPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")

  const { id } = await params

  const [[number], events, allProducts] = await Promise.all([
    // Excludes accessTokenEncrypted — the token must never reach the client.
    db.select(numberPublicColumns).from(numbers).where(eq(numbers.id, id)).limit(1),
    db
      .select()
      .from(eventLog)
      .where(eq(eventLog.numberId, id))
      .orderBy(desc(eventLog.createdAt))
      .limit(100),
    db.select().from(products).where(eq(products.active, true)).orderBy(products.name),
  ])

  if (!number) notFound()

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <a
          href="/dashboard"
          className="text-muted-foreground hover:text-foreground text-sm"
        >
          ← Números
        </a>
      </div>

      <NumberDetail
        initialNumber={number}
        initialEvents={events}
        products={allProducts}
      />
    </div>
  )
}
