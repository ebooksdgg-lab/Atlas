import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

// Full implementation in Step 10 (Evolution + Chatwoot + Typebot setup)
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  return NextResponse.json(
    { error: "Not yet implemented — see Step 10" },
    { status: 501 }
  )
}
