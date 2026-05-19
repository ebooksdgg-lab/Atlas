import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema"

// postgres.js connects lazily — safe at build time even without DATABASE_URL
const client = postgres(
  process.env.DATABASE_URL ?? "postgresql://build-placeholder/atlas",
  { max: 10, idle_timeout: 20, connect_timeout: 10 }
)

export const db = drizzle(client, { schema })
