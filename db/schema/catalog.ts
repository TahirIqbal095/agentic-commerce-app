import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { createdAt, currency, id, money, updatedAt } from "./columns";
import { productRelationTypeEnum } from "./enums";
import type { JsonObject } from "./types";

export const products = pgTable(
  "products",
  {
    id: id(),
    name: varchar("name", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 200 }).notNull(),
    description: text("description").notNull(),
    category: varchar("category", { length: 120 }).notNull(),
    priceMinor: money("price_minor"),
    currency: currency(),
    stock: integer("stock").notNull().default(0),
    active: boolean("active").notNull().default(true),
    attributes: jsonb("attributes").$type<JsonObject>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("products_slug_unique").on(table.slug),
    index("products_category_idx").on(table.category),
    check("products_currency_inr", sql`${table.currency} = 'INR'`),
    check("products_price_nonnegative", sql`${table.priceMinor} >= 0`),
    check("products_stock_nonnegative", sql`${table.stock} >= 0`),
  ],
);

export const productRelations = pgTable(
  "product_relations",
  {
    id: id(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    relatedProductId: uuid("related_product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    relationType: productRelationTypeEnum("relation_type").notNull(),
    score: integer("score").notNull().default(0),
    reason: text("reason").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("product_relations_unique").on(
      table.productId,
      table.relatedProductId,
      table.relationType,
    ),
    check(
      "product_relations_not_self",
      sql`${table.productId} <> ${table.relatedProductId}`,
    ),
    check(
      "product_relations_score_range",
      sql`${table.score} between 0 and 100`,
    ),
  ],
);
