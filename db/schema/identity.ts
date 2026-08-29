import { sql } from "drizzle-orm";
import {
  check,
  pgTable,
  text,
  uniqueIndex,
  uuid,
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
    check("brands_singleton_key", sql`${table.singletonKey} = 'BRAND'`),
  ],
);

export const users = pgTable(
  "users",
  {
    id: id(),
    email: varchar("email", { length: 320 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const brandAdmins = pgTable(
  "brand_admins",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("brand_admins_user_unique").on(table.userId)],
);
