#!/usr/bin/env node
// Destructive migration runner — always drops and recreates everything.
// Run with:
//   docker exec atlas-atlas-app-1 node /app/scripts/migrate-prod.mjs
import postgres from "postgres"
import { readFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is not set")
  process.exit(1)
}

console.log(`URL:  ${DATABASE_URL.replace(/:([^@]+)@/, ":****@")}`)

const sql = postgres(DATABASE_URL, {
  max: 1,
  idle_timeout: 30,
  connect_timeout: 10,
  ssl: false,
})

// Confirm which DB we're actually in
const [{ db, host }] = await sql`
  SELECT current_database() AS db, inet_server_addr()::text AS host
`
console.log(`DB:   ${db}`)
console.log(`Host: ${host}`)

// ─── Step 1: drop drizzle schema ─────────────────────────────────────────────
console.log("\n[1] DROP SCHEMA drizzle CASCADE...")
await sql.unsafe("DROP SCHEMA IF EXISTS drizzle CASCADE")
console.log("    Done.")

// ─── Step 2: drop all tables in public ───────────────────────────────────────
console.log("\n[2] Dropping all tables in public schema...")
const publicTables = await sql`
  SELECT tablename FROM pg_tables WHERE schemaname = 'public'
`
if (publicTables.length === 0) {
  console.log("    No tables to drop.")
} else {
  for (const { tablename } of publicTables) {
    console.log(`    DROP TABLE public.${tablename} CASCADE`)
    await sql.unsafe(`DROP TABLE IF EXISTS public."${tablename}" CASCADE`)
  }
}

// ─── Step 3: drop all enums in public ────────────────────────────────────────
console.log("\n[3] Dropping all custom types (enums) in public schema...")
const enums = await sql`
  SELECT typname FROM pg_type
  WHERE typtype = 'e' AND typnamespace = (
    SELECT oid FROM pg_namespace WHERE nspname = 'public'
  )
`
if (enums.length === 0) {
  console.log("    No enums to drop.")
} else {
  for (const { typname } of enums) {
    console.log(`    DROP TYPE public.${typname}`)
    await sql.unsafe(`DROP TYPE IF EXISTS public."${typname}" CASCADE`)
  }
}

// ─── Step 4: create drizzle schema + migrations table ────────────────────────
console.log("\n[4] Creating drizzle.__drizzle_migrations...")
await sql.unsafe("CREATE SCHEMA drizzle")
await sql.unsafe(`
  CREATE TABLE drizzle.__drizzle_migrations (
    id         SERIAL PRIMARY KEY,
    hash       TEXT NOT NULL,
    created_at BIGINT
  )
`)
console.log("    Done.")

// ─── Step 5: run migrations ───────────────────────────────────────────────────
const DRIZZLE_DIR = join(__dirname, "..", "drizzle")
const journal = JSON.parse(
  readFileSync(join(DRIZZLE_DIR, "meta", "_journal.json"), "utf8")
)

console.log(`\n[5] Applying ${journal.entries.length} migration(s)...`)

for (const entry of journal.entries) {
  console.log(`\n    [apply] ${entry.tag}`)
  const content = readFileSync(join(DRIZZLE_DIR, `${entry.tag}.sql`), "utf8")
  const statements = content
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean)

  console.log(`            ${statements.length} statement(s)`)

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i]
    console.log(`            [${i + 1}] ${stmt.slice(0, 80).replace(/\n/g, " ")}`)
    try {
      await sql.unsafe(stmt)
      console.log(`                OK`)
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
  console.log(`    [done]  ${entry.tag}`)
}

// ─── Step 6: verify ───────────────────────────────────────────────────────────
console.log("\n[6] Verifying tables in public schema...")
const created = await sql`
  SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
`
console.log(`    Tables: ${created.map((r) => r.tablename).join(", ") || "(NONE)"}`)

if (created.length === 0) {
  console.error("\nERROR: No tables found in public after migration. Something is wrong.")
  await sql.end()
  process.exit(1)
}

await sql.end()
console.log("\nMigration complete.")
