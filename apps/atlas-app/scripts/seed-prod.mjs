#!/usr/bin/env node
// Standalone seed script for production containers.
// Run with:
//   docker exec -e SEED_LUCHO_PASSWORD=xxx -e SEED_GABI_PASSWORD=xxx \
//     atlas-atlas-app-1 node /app/scripts/seed-prod.mjs
import postgres from "postgres"
import bcryptjs from "bcryptjs"

const DATABASE_URL = process.env.DATABASE_URL
const LUCHO_PASSWORD = process.env.SEED_LUCHO_PASSWORD
const GABI_PASSWORD = process.env.SEED_GABI_PASSWORD

if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is not set")
  process.exit(1)
}
if (!LUCHO_PASSWORD || !GABI_PASSWORD) {
  console.error("ERROR: SEED_LUCHO_PASSWORD and SEED_GABI_PASSWORD are required")
  process.exit(1)
}

const sql = postgres(DATABASE_URL)

const users = [
  { email: "luchoeditor@gmail.com", name: "Lucho", password: LUCHO_PASSWORD },
  { email: "ebooksdgg@gmail.com",   name: "Gabi",  password: GABI_PASSWORD },
]

for (const user of users) {
  const hash = await bcryptjs.hash(user.password, 12)
  await sql`
    INSERT INTO users (id, email, password_hash, name, role)
    VALUES (gen_random_uuid(), ${user.email}, ${hash}, ${user.name}, 'admin')
    ON CONFLICT (email) DO UPDATE SET
      password_hash = EXCLUDED.password_hash,
      name          = EXCLUDED.name
  `
  console.log(`✓ upserted ${user.email}`)
}

await sql.end()
console.log("Seed complete.")
