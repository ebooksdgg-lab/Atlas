#!/usr/bin/env node
// Migration runner for production containers.
//
// Incremental (default):
//   docker exec atlas-atlas-app-1 node /app/scripts/migrate-prod.mjs
//   Applies only pending migrations — existing data is preserved.
//
// Full reset (destructive — drops all data):
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

console.log(`URL:  ${DATABASE_URL.replace(/:([^@]+)@/, ":****@")}`)
console.log(`Mode: ${RESET ? "RESET (destructive)" : "incremental"}`)

const sql = postgres(DATABASE_URL, {
  max: 1,
  idle_timeout: 30,
  connect_timeout: 10,
  ssl: false,
})

const [{ db, host }] = await sql`
  SELECT current_database() AS db, inet_server_addr()::text AS host
`
console.log(`DB:   ${db}`)
console.log(`Host: ${host}`)

// ─── RESET path ───────────────────────────────────────────────────────────────

if (RESET) {
  console.log("\n[reset] DROP SCHEMA drizzle CASCADE...")
  await sql.unsafe("DROP SCHEMA IF EXISTS drizzle CASCADE")

  console.log("[reset] Dropping all tables in public schema...")
  const publicTables = await sql`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `
  for (const { tablename } of publicTables) {
    console.log(`        DROP TABLE public.${tablename}`)
    await sql.unsafe(`DROP TABLE IF EXISTS public."${tablename}" CASCADE`)
  }

  console.log("[reset] Dropping all custom types (enums) in public schema...")
  const enums = await sql`
    SELECT typname FROM pg_type
    WHERE typtype = 'e' AND typnamespace = (
      SELECT oid FROM pg_namespace WHERE nspname = 'public'
    )
  `
  for (const { typname } of enums) {
    console.log(`        DROP TYPE public.${typname}`)
    await sql.unsafe(`DROP TYPE IF EXISTS public."${typname}" CASCADE`)
  }
}

// ─── Ensure drizzle schema + migrations table exist ───────────────────────────

await sql.unsafe("CREATE SCHEMA IF NOT EXISTS drizzle")
await sql.unsafe(`
  CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
    id         SERIAL PRIMARY KEY,
    hash       TEXT NOT NULL,
    created_at BIGINT
  )
`)

// ─── Determine pending migrations ─────────────────────────────────────────────

const DRIZZLE_DIR = join(__dirname, "..", "drizzle")
const journal = JSON.parse(
  readFileSync(join(DRIZZLE_DIR, "meta", "_journal.json"), "utf8")
)

const applied = await sql`SELECT hash FROM drizzle.__drizzle_migrations`
const appliedSet = new Set(applied.map((r) => r.hash))

const pending = journal.entries.filter((e) => !appliedSet.has(e.tag))

if (pending.length === 0) {
  console.log("\nNo pending migrations — database is up to date.")
  await sql.end()
  process.exit(0)
}

console.log(`\nApplying ${pending.length} pending migration(s) (${journal.entries.length - pending.length} already applied)...`)

// ─── Apply pending migrations ─────────────────────────────────────────────────

for (const entry of pending) {
  console.log(`\n  [apply] ${entry.tag}`)
  const content = readFileSync(join(DRIZZLE_DIR, `${entry.tag}.sql`), "utf8")
  const statements = content
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean)

  console.log(`          ${statements.length} statement(s)`)

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i]
    console.log(`          [${i + 1}] ${stmt.slice(0, 80).replace(/\n/g, " ")}`)
    try {
      await sql.unsafe(stmt)
      console.log(`               OK`)
    } catch (err) {
      console.error(`\nFAILED on statement ${i + 1}:\n${stmt}\n\nPostgres error: ${err.message}`)
      await sql.end()
      process.exit(1)
    }
  }

  await sql`
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES (${entry.tag}, ${entry.when})
  `
  console.log(`  [done]  ${entry.tag}`)
}

// ─── Verify ───────────────────────────────────────────────────────────────────

const created = await sql`
  SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
`
console.log(`\nTables in public: ${created.map((r) => r.tablename).join(", ") || "(NONE)"}`)

if (created.length === 0) {
  console.error("\nERROR: No tables found in public after migration. Something is wrong.")
  await sql.end()
  process.exit(1)
}

await sql.end()
console.log("\nMigration complete.")
