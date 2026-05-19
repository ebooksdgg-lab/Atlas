export default async function NumberPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Número</h1>
      <p className="text-muted-foreground text-sm font-mono">{id}</p>
      {/* Detail tabs (Overview / Activity / Actions) — implemented in build step 12 */}
    </div>
  )
}
