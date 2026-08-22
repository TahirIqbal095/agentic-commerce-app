import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { carts } from "./cart";
import { productVariants, products } from "./catalog";
import { approvals, checkoutProposals } from "./checkout";
import { createdAt, currency, id, money, updatedAt } from "./columns";
import { orderStatusEnum } from "./enums";
import { merchants, users } from "./identity";

export const orders = pgTable(
  "orders",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "restrict" }),
    cartId: uuid("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "restrict" }),
    proposalId: uuid("proposal_id")
      .notNull()
      .references(() => checkoutProposals.id, { onDelete: "restrict" }),
    approvalId: uuid("approval_id")
      .notNull()
      .references(() => approvals.id, { onDelete: "restrict" }),
    status: orderStatusEnum("status").notNull().default("PENDING"),
    currency: currency(),
    subtotalMinor: money("subtotal_minor"),
    discountMinor: money("discount_minor"),
    shippingMinor: money("shipping_minor"),
    taxMinor: money("tax_minor"),
    totalMinor: money("total_minor"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("orders_proposal_unique").on(table.proposalId),
    uniqueIndex("orders_approval_unique").on(table.approvalId),
    index("orders_customer_idx").on(table.userId, table.merchantId),
    check(
      "orders_amounts_nonnegative",
      sql`${table.subtotalMinor} >= 0 and ${table.discountMinor} >= 0 and ${table.shippingMinor} >= 0 and ${table.taxMinor} >= 0 and ${table.totalMinor} >= 0`,
    ),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: id(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    variantId: uuid("variant_id").references(() => productVariants.id, {
      onDelete: "restrict",
    }),
    nameSnapshot: varchar("name_snapshot", { length: 240 }).notNull(),
    quantity: integer("quantity").notNull(),
    unitPriceMinor: money("unit_price_minor"),
    lineTotalMinor: money("line_total_minor"),
    createdAt: createdAt(),
  },
  (table) => [
    index("order_items_order_idx").on(table.orderId),
    check("order_items_quantity_positive", sql`${table.quantity} > 0`),
    check(
      "order_items_amounts_nonnegative",
      sql`${table.unitPriceMinor} >= 0 and ${table.lineTotalMinor} >= 0`,
    ),
  ],
);
