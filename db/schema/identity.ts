import { index, pgTable, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { createdAt, currency, id, updatedAt } from "./columns";

export const merchants = pgTable(
  "merchants",
  {
    id: id(),
    name: varchar("name", { length: 160 }).notNull(),
    slug: varchar("slug", { length: 160 }).notNull(),
    currency: currency(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("merchants_slug_unique").on(table.slug)],
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

export const merchantAdmins = pgTable(
  "merchant_admins",
  {
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("merchant_admins_membership_unique").on(
      table.merchantId,
      table.userId,
    ),
    index("merchant_admins_user_idx").on(table.userId),
  ],
);
