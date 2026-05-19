import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { numbers } from "@/lib/db/schema"
import { desc } from "drizzle-orm"
import { NumbersTable } from "./_components/numbers-table"

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")

  const rows = await db
    .select()
    .from(numbers)
    .orderBy(desc(numbers.createdAt))

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Números</h1>
        <a
          href="/connect"
          className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          + Conectar número
        </a>
      </div>

      <NumbersTable initialRows={rows} />
    </div>
  )
}
