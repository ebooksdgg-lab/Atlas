/**
 * One-time seed: inserts or updates Lucho and Gabi in the users table.
 * Usage:
 *   SEED_LUCHO_PASSWORD=xxx SEED_GABI_PASSWORD=yyy npm run db:seed
 * Run against the live DB (DATABASE_URL must point to the real atlas DB).
 */
import bcrypt from "bcryptjs"
import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"
import * as schema from "./schema"

async function seed() {
  const url = process.env.DATABASE_URL
  if (!url || url.includes("build-placeholder")) {
    console.error("Set DATABASE_URL to the live atlas database before seeding.")
    process.exit(1)
  }

  const luchoPw = process.env.SEED_LUCHO_PASSWORD
  const gabiPw = process.env.SEED_GABI_PASSWORD

  if (!luchoPw || !gabiPw) {
    console.error("Set SEED_LUCHO_PASSWORD and SEED_GABI_PASSWORD environment variables.")
    process.exit(1)
  }

  const client = postgres(url, { max: 1 })
  const db = drizzle(client, { schema })

  const { users } = schema

  const luchoHash = await bcrypt.hash(luchoPw, 12)
  const gabiHash = await bcrypt.hash(gabiPw, 12)

  const [lucho] = await db
    .insert(users)
    .values({ email: "luchoeditor@gmail.com", passwordHash: luchoHash, name: "Lucho", role: "admin" })
    .onConflictDoUpdate({ target: users.email, set: { passwordHash: luchoHash, name: "Lucho" } })
    .returning()

  const [gabi] = await db
    .insert(users)
    .values({ email: "ebooksdgg@gmail.com", passwordHash: gabiHash, name: "Gabi", role: "admin" })
    .onConflictDoUpdate({ target: users.email, set: { passwordHash: gabiHash, name: "Gabi" } })
    .returning()

  console.log("Users seeded:")
  console.log(`  ${lucho.email} — ${lucho.name} (${lucho.role})`)
  console.log(`  ${gabi.email} — ${gabi.name} (${gabi.role})`)

  await client.end()
}

seed().catch((e) => {
  console.error(e)
  process.exit(1)
})
