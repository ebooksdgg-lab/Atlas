import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { numbers } from "@/lib/db/schema"
import { desc } from "drizzle-orm"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const rows = await db
    .select()
    .from(numbers)
    .orderBy(desc(numbers.createdAt))

  return NextResponse.json(rows)
}
