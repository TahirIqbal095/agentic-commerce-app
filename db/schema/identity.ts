import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { createdAt, currency, id, updatedAt } from "./columns";

export const brands = pgTable(
  "brands",
  {
    id: id(),
    singletonKey: varchar("singleton_key", { length: 16 })
      .notNull()
      .default("BRAND"),
    name: varchar("name", { length: 160 }).notNull(),
    slug: varchar("slug", { length: 160 }).notNull(),
    description: text("description").notNull(),
    logoUrl: varchar("logo_url", { length: 500 }),
    currency: currency(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("brands_singleton_unique").on(table.singletonKey),
    uniqueIndex("brands_slug_unique").on(table.slug),
    check("brands_currency_inr", sql`${table.currency} = 'INR'`),
    check("brands_singleton_key", sql`${table.singletonKey} = 'BRAND'`),
  ],
);

export const guestSessions = pgTable(
  "guest_sessions",
  {
    id: id(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("guest_sessions_token_hash_unique").on(table.tokenHash),
    index("guest_sessions_expiry_idx").on(table.expiresAt),
  ],
);
