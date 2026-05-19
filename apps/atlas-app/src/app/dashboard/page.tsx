export default function DashboardPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Números</h1>
        <a
          href="/connect"
          className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium"
        >
          + Conectar nuevo número
        </a>
      </div>
      {/* Stats header + filters + table — implemented in build step 11 */}
      <p className="text-muted-foreground text-sm">Tabla de números activos</p>
    </div>
  )
}
