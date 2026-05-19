import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { numbers, eventLog } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

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

  if (number.status !== "active" && number.status !== "paused") {
    return NextResponse.json(
      { error: "Solo se puede pausar/activar números activos o pausados" },
      { status: 422 }
    )
  }

  const newStatus = number.status === "active" ? "paused" : "active"
  const eventType = newStatus === "paused" ? "paused" : "activated"
  const now = new Date()

  const [updated] = await db
    .update(numbers)
    .set({ status: newStatus, updatedAt: now })
    .where(eq(numbers.id, id))
    .returning()

  await db.insert(eventLog).values({
    numberId: id,
    eventType,
    data: { previousStatus: number.status },
  })

  return NextResponse.json(updated)
}
