#!/usr/bin/env node
// Standalone migration runner for production containers.
// Compatible with drizzle-kit migrate: uses the same drizzle.__drizzle_migrations
// table and tag-based hash, so running drizzle-kit later won't re-apply migrations.
//
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

const DRIZZLE_DIR = join(__dirname, "..", "drizzle")
const JOURNAL_PATH = join(DRIZZLE_DIR, "meta", "_journal.json")

const journal = JSON.parse(readFileSync(JOURNAL_PATH, "utf8"))
const sql = postgres(DATABASE_URL, { max: 1 })

// Create drizzle schema + migrations table (matches drizzle-kit format exactly)
await sql`CREATE SCHEMA IF NOT EXISTS drizzle`
await sql`
  CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
    id      SERIAL PRIMARY KEY,
    hash    TEXT NOT NULL,
    created_at BIGINT
  )
`

// Get already-applied migration tags
const applied = await sql`SELECT hash FROM drizzle.__drizzle_migrations`
const appliedSet = new Set(applied.map((r) => r.hash))

let ran = 0
for (const entry of journal.entries) {
  if (appliedSet.has(entry.tag)) {
    console.log(`  skip  ${entry.tag}`)
    continue
  }

  const sqlFile = join(DRIZZLE_DIR, `${entry.tag}.sql`)
  const content = readFileSync(sqlFile, "utf8")
  const statements = content
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean)

  console.log(`  apply ${entry.tag} (${statements.length} statements)`)

  for (const stmt of statements) {
    await sql.unsafe(stmt)
  }

  await sql`
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES (${entry.tag}, ${entry.when})
  `
  ran++
}

await sql.end()

if (ran === 0) {
  console.log("No new migrations to apply.")
} else {
  console.log(`Done — applied ${ran} migration(s).`)
}
