import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { numbers, eventLog } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { deleteInstance } from "@/lib/evolution"

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const [number] = await db
    .select()
    .from(numbers)
    .where(eq(numbers.id, id))
    .limit(1)

  if (!number) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (number.status === "disconnected") {
    return NextResponse.json({ error: "El número ya está desconectado" }, { status: 422 })
  }

  // Delete Evolution instance (best effort — continue even if it fails)
  if (number.evolutionInstanceName) {
    await deleteInstance(number.evolutionInstanceName)
  }

  const now = new Date()
  const [updated] = await db
    .update(numbers)
    .set({ status: "disconnected", updatedAt: now })
    .where(eq(numbers.id, id))
    .returning()

  await db.insert(eventLog).values({
    numberId: id,
    eventType: "disconnected",
    data: { instanceName: number.evolutionInstanceName },
  })

  return NextResponse.json(updated)
}
