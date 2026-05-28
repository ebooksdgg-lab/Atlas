#!/usr/bin/env node
// Standalone migration runner for production containers.
//
// Normal run:
//   docker exec atlas-atlas-app-1 node /app/scripts/migrate-prod.mjs
//
// Force reset (drops drizzle schema so all migrations re-apply from scratch):
//   docker exec atlas-atlas-app-1 node /app/scripts/migrate-prod.mjs --reset
import postgres from "postgres"
import { readFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const RESET = process.argv.includes("--reset")

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is not set")
  process.exit(1)
}

console.log(`Connecting to: ${DATABASE_URL.replace(/:([^@]+)@/, ":****@")}`)

const sql = postgres(DATABASE_URL, {
  max: 1,
  idle_timeout: 30,
  connect_timeout: 10,
  ssl: false,
  onnotice: (n) => console.log("PG notice:", n.message),
})

const [{ db }] = await sql`SELECT current_database() AS db`
console.log(`Connected. Database: ${db}`)

// ─── --reset: drop drizzle schema and exit ────────────────────────────────────
if (RESET) {
  console.log("RESET: dropping schema drizzle CASCADE...")
  await sql.unsafe("DROP SCHEMA IF EXISTS drizzle CASCADE")
  console.log("Done. Run without --reset to re-apply all migrations from scratch.")
  await sql.end()
  process.exit(0)
}

// ─── Bootstrap migrations table ───────────────────────────────────────────────
await sql.unsafe("CREATE SCHEMA IF NOT EXISTS drizzle")
await sql.unsafe(`
  CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
    id         SERIAL PRIMARY KEY,
    hash       TEXT NOT NULL,
    created_at BIGINT
  )
`)

// ─── Load journal ─────────────────────────────────────────────────────────────
const DRIZZLE_DIR = join(__dirname, "..", "drizzle")
const journal = JSON.parse(
  readFileSync(join(DRIZZLE_DIR, "meta", "_journal.json"), "utf8")
)

// ─── Load applied set ─────────────────────────────────────────────────────────
const applied = await sql`SELECT hash FROM drizzle.__drizzle_migrations`
const appliedSet = new Set(applied.map((r) => r.hash))
console.log(`Recorded as applied: ${appliedSet.size} migration(s)`)

// ─── Self-heal: verify recorded migrations actually created their tables ───────
for (const entry of journal.entries) {
  if (!appliedSet.has(entry.tag)) continue

  const content = readFileSync(join(DRIZZLE_DIR, `${entry.tag}.sql`), "utf8")

  // Extract table names from CREATE TABLE IF NOT EXISTS "tablename"
  const expected = [...content.matchAll(/CREATE TABLE IF NOT EXISTS "(\w+)"/g)]
    .map((m) => m[1])

  if (expected.length === 0) continue

  const rows = await sql`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename = ANY(${expected})
  `
  const existing = new Set(rows.map((r) => r.tablename))
  const missing = expected.filter((t) => !existing.has(t))

  if (missing.length > 0) {
    console.log(
      `  [stale] ${entry.tag} — in __drizzle_migrations but tables missing: ${missing.join(", ")}`
    )
    await sql`DELETE FROM drizzle.__drizzle_migrations WHERE hash = ${entry.tag}`
    appliedSet.delete(entry.tag)
    console.log(`          Stale record removed — will re-apply.`)
  }
}

// ─── Apply pending migrations ─────────────────────────────────────────────────
let ran = 0

for (const entry of journal.entries) {
  if (appliedSet.has(entry.tag)) {
    console.log(`  [skip]  ${entry.tag}`)
    continue
  }

  console.log(`  [apply] ${entry.tag}`)

  const content = readFileSync(join(DRIZZLE_DIR, `${entry.tag}.sql`), "utf8")
  const statements = content
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean)

  console.log(`          ${statements.length} statement(s)`)

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i]
    console.log(`          [${i + 1}/${statements.length}] ${stmt.slice(0, 72).replace(/\n/g, " ")}`)
    try {
      await sql.unsafe(stmt)
    } catch (err) {
      console.error(`\nERROR on statement ${i + 1}:\n${stmt}\n\nPostgres: ${err.message}`)
      await sql.end()
      process.exit(1)
    }
  }

  await sql`
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES (${entry.tag}, ${entry.when})
  `
  ran++
}

// ─── Final verification ───────────────────────────────────────────────────────
const tables = await sql`
  SELECT tablename FROM pg_tables
  WHERE schemaname = 'public'
  ORDER BY tablename
`
console.log(
  `\nTables in public: ${tables.map((t) => t.tablename).join(", ") || "(none — something went wrong)"}`
)

await sql.end()

if (ran === 0) {
  console.log("No new migrations applied.")
} else {
  console.log(`Done — applied ${ran} migration(s).`)
}
