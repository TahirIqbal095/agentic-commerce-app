import { sql } from "drizzle-orm";
import {
  bigint,
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
import { merchants } from "./identity";
import type { JsonObject } from "./types";

export const products = pgTable(
  "products",
  {
    id: id(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
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
    uniqueIndex("products_merchant_slug_unique").on(
      table.merchantId,
      table.slug,
    ),
    index("products_merchant_category_idx").on(
      table.merchantId,
      table.category,
    ),
    check("products_price_nonnegative", sql`${table.priceMinor} >= 0`),
    check("products_stock_nonnegative", sql`${table.stock} >= 0`),
  ],
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: id(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    sku: varchar("sku", { length: 100 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    priceOverrideMinor: bigint("price_override_minor", { mode: "number" }),
    stock: integer("stock").notNull().default(0),
    attributes: jsonb("attributes").$type<JsonObject>().notNull().default({}),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("product_variants_sku_unique").on(table.sku),
    index("product_variants_product_idx").on(table.productId),
    check(
      "product_variants_price_nonnegative",
      sql`${table.priceOverrideMinor} is null or ${table.priceOverrideMinor} >= 0`,
    ),
    check("product_variants_stock_nonnegative", sql`${table.stock} >= 0`),
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
