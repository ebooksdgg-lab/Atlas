import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { metaApps, products, users } from "@/lib/db/schema"
import { MetaAppsSection } from "./_components/meta-apps-section"
import { ProductsSection } from "./_components/products-section"

export default async function SettingsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")

  const [allApps, allProducts, allUsers] = await Promise.all([
    db.select().from(metaApps),
    db.select().from(products).orderBy(products.createdAt),
    db
      .select({ id: users.id, email: users.email, name: users.name, role: users.role })
      .from(users),
  ])

  // Strip encrypted secrets before passing to client components
  const appsForClient = allApps.map(({ appSecretEncrypted, ...rest }) => ({
    ...rest,
    hasSecret: !!appSecretEncrypted,
  }))

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-10">
      <h1 className="text-2xl font-semibold">Configuración</h1>

      <MetaAppsSection apps={appsForClient} />

      <ProductsSection products={allProducts} />

      {/* Users — read-only list, no client interactivity needed */}
      <section>
        <h2 className="text-lg font-medium mb-4">Usuarios</h2>
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Nombre</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Email</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Rol</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {allUsers.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-2.5">{u.name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{u.email}</td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">
                      {u.role}
                    </span>
                  </td>
                </tr>
              ))}
              {allUsers.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">
                    Sin usuarios
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
