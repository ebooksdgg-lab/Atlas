import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"

// ─── Enums ───────────────────────────────────────────────────────

export const numberStatusEnum = pgEnum("number_status", [
  "active",
  "paused",
  "disconnected",
  "banned",
])

export const qualityRatingEnum = pgEnum("quality_rating", [
  "GREEN",
  "YELLOW",
  "RED",
  "UNKNOWN",
])

export const userRoleEnum = pgEnum("user_role", ["admin"])

// ─── Numbers ─────────────────────────────────────────────────────

export const numbers = pgTable("numbers", {
  id: uuid("id").primaryKey().defaultRandom(),
  phoneNumber: text("phone_number").notNull().unique(),
  displayName: text("display_name"),
  businessId: text("business_id"),
  wabaId: text("waba_id"),
  phoneNumberId: text("phone_number_id"),
  productSlug: text("product_slug"),
  productName: text("product_name"),
  metaAppUsed: text("meta_app_used"),
  internalLabel: text("internal_label"),
  status: numberStatusEnum("status").notNull().default("active"),
  qualityRating: qualityRatingEnum("quality_rating").notNull().default("UNKNOWN"),
  messagingTier: text("messaging_tier"),
  evolutionInstanceName: text("evolution_instance_name"),
  chatwootInboxId: integer("chatwoot_inbox_id"),
  typebotId: text("typebot_id"),
  connectedAt: timestamp("connected_at", { withTimezone: true }),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // updatedAt has no DB trigger — set explicitly on every UPDATE in application code
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

// ─── Products ────────────────────────────────────────────────────

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  typebotId: text("typebot_id"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

// ─── Event log ───────────────────────────────────────────────────

export const eventLog = pgTable("event_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  numberId: uuid("number_id")
    .notNull()
    .references(() => numbers.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  data: jsonb("data"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

// ─── Meta apps ───────────────────────────────────────────────────

export const metaApps = pgTable("meta_apps", {
  id: text("id").primaryKey(), // "app_1" | "app_2" | "app_3"
  appId: text("app_id").notNull(),
  appSecretEncrypted: text("app_secret_encrypted").notNull(),
  configId: text("config_id").notNull(),
  isActive: boolean("is_active").notNull().default(false),
  notes: text("notes"),
})

// ─── Users ───────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: userRoleEnum("role").notNull().default("admin"),
})

// ─── Relations ───────────────────────────────────────────────────

export const numbersRelations = relations(numbers, ({ many }) => ({
  events: many(eventLog),
}))

export const eventLogRelations = relations(eventLog, ({ one }) => ({
  number: one(numbers, {
    fields: [eventLog.numberId],
    references: [numbers.id],
  }),
}))

// ─── Inferred types ──────────────────────────────────────────────

export type PhoneNumber = typeof numbers.$inferSelect
export type NewPhoneNumber = typeof numbers.$inferInsert
export type Product = typeof products.$inferSelect
export type NewProduct = typeof products.$inferInsert
export type EventLogEntry = typeof eventLog.$inferSelect
export type NewEventLogEntry = typeof eventLog.$inferInsert
export type MetaApp = typeof metaApps.$inferSelect
export type User = typeof users.$inferSelect
