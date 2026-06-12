import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { metaApps } from "@/lib/db/schema"
import { ConnectForm } from "./_components/connect-form"

export default async function ConnectPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")

  const allApps = await db
    .select({
      id: metaApps.id,
      appId: metaApps.appId,
      configId: metaApps.configId,
      isActive: metaApps.isActive,
    })
    .from(metaApps)

  const activeApp = allApps.find((a) => a.isActive) ?? null
  const apiVersion = process.env.META_API_VERSION ?? "v21.0"

  return (
    <div className="p-6 max-w-lg mx-auto">
      <h1 className="text-2xl font-semibold mb-2">Conectar número</h1>
      <p className="text-muted-foreground text-sm mb-8">
        Vinculá un número de WhatsApp Business vía Meta Embedded Signup. Conectás uno
        por vez; después le asignás un producto desde el dashboard.
      </p>
      <ConnectForm activeApp={activeApp} apiVersion={apiVersion} />
    </div>
  )
}
