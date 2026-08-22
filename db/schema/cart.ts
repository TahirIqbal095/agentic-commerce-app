import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { productVariants, products } from "./catalog";
import { createdAt, currency, id, money, updatedAt } from "./columns";
import { cartStatusEnum } from "./enums";
import { merchants, users } from "./identity";

export const carts = pgTable(
  "carts",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "restrict" }),
    status: cartStatusEnum("status").notNull().default("ACTIVE"),
    currency: currency(),
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("carts_one_active_per_customer_merchant")
      .on(table.userId, table.merchantId)
      .where(sql`${table.status} = 'ACTIVE'`),
    index("carts_user_merchant_idx").on(table.userId, table.merchantId),
    check("carts_version_positive", sql`${table.version} > 0`),
  ],
);

export const cartItems = pgTable(
  "cart_items",
  {
    id: id(),
    cartId: uuid("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    variantId: uuid("variant_id").references(() => productVariants.id, {
      onDelete: "restrict",
    }),
    quantity: integer("quantity").notNull(),
    unitPriceSnapshotMinor: money("unit_price_snapshot_minor"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("cart_items_unvarianted_selection_unique")
      .on(table.cartId, table.productId)
      .where(sql`${table.variantId} is null`),
    uniqueIndex("cart_items_variant_selection_unique")
      .on(table.cartId, table.variantId)
      .where(sql`${table.variantId} is not null`),
    index("cart_items_cart_idx").on(table.cartId),
    check(
      "cart_items_quantity_range",
      sql`${table.quantity} between 1 and 10`,
    ),
    check(
      "cart_items_snapshot_nonnegative",
      sql`${table.unitPriceSnapshotMinor} >= 0`,
    ),
  ],
);
