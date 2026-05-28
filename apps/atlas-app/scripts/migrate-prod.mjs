#!/usr/bin/env node
// Standalone migration runner for production containers.
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

// Log host for connection verification (mask password)
const maskedUrl = DATABASE_URL.replace(/:([^@]+)@/, ":****@")
console.log(`Connecting to: ${maskedUrl}`)

const sql = postgres(DATABASE_URL, {
  max: 1,
  idle_timeout: 30,
  connect_timeout: 10,
  ssl: false,
  onnotice: (notice) => console.log("PG notice:", notice.message),
})

// Verify connection and target database
const [{ db }] = await sql`SELECT current_database() AS db`
console.log(`Connected. Current database: ${db}`)

// Bootstrap migrations tracking table
console.log("Ensuring drizzle.__drizzle_migrations table exists...")
await sql.unsafe("CREATE SCHEMA IF NOT EXISTS drizzle")
await sql.unsafe(`
  CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
    id         SERIAL PRIMARY KEY,
    hash       TEXT NOT NULL,
    created_at BIGINT
  )
`)
console.log("Migrations table ready.")

// Load journal
const DRIZZLE_DIR = join(__dirname, "..", "drizzle")
const journal = JSON.parse(
  readFileSync(join(DRIZZLE_DIR, "meta", "_journal.json"), "utf8")
)

// Load applied migrations
const applied = await sql`SELECT hash FROM drizzle.__drizzle_migrations`
const appliedSet = new Set(applied.map((r) => r.hash))
console.log(`Already applied: ${appliedSet.size} migration(s)`)

let ran = 0

for (const entry of journal.entries) {
  if (appliedSet.has(entry.tag)) {
    console.log(`  [skip]  ${entry.tag}`)
    continue
  }

  console.log(`  [apply] ${entry.tag}`)

  const content = readFileSync(
    join(DRIZZLE_DIR, `${entry.tag}.sql`),
    "utf8"
  )

  const statements = content
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean)

  console.log(`          ${statements.length} statement(s) to run`)

  // Run each statement individually; abort on first error
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i]
    console.log(`          [${i + 1}/${statements.length}] ${stmt.slice(0, 72).replace(/\n/g, " ")}…`)
    try {
      await sql.unsafe(stmt)
    } catch (err) {
      console.error(`\nERROR on statement ${i + 1}:\n${stmt}\n\nPostgres error: ${err.message}`)
      await sql.end()
      process.exit(1)
    }
  }

  // Record migration as applied
  await sql`
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES (${entry.tag}, ${entry.when})
  `
  console.log(`          Recorded in __drizzle_migrations.`)
  ran++
}

// Final verification: list created tables
const tables = await sql`
  SELECT tablename
  FROM pg_tables
  WHERE schemaname = 'public'
  ORDER BY tablename
`
console.log(`\nTables in public schema: ${tables.map((t) => t.tablename).join(", ") || "(none)"}`)

await sql.end()

if (ran === 0) {
  console.log("No new migrations to apply.")
} else {
  console.log(`\nDone — applied ${ran} migration(s).`)
}
