import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { carts } from "./cart";
import { products } from "./catalog";
import { createdAt, currency, id, money, updatedAt } from "./columns";
import {
  approvalStatusEnum,
  checkoutProposalStatusEnum,
  policyDecisionEnum,
} from "./enums";
import { merchants, users } from "./identity";
import type { JsonObject } from "./types";

export const policies = pgTable(
  "policies",
  {
    id: id(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 120 }).notNull(),
    value: jsonb("value").$type<JsonObject>().notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("policies_merchant_key_unique").on(table.merchantId, table.key),
  ],
);

export const checkoutProposals = pgTable(
  "checkout_proposals",
  {
    id: id(),
    cartId: uuid("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "restrict" }),
    cartVersion: integer("cart_version").notNull(),
    status: checkoutProposalStatusEnum("status").notNull().default("PREPARED"),
    policyDecision: policyDecisionEnum("policy_decision").notNull(),
    policyReasons: jsonb("policy_reasons")
      .$type<string[]>()
      .notNull()
      .default([]),
    subtotalMinor: money("subtotal_minor"),
    discountMinor: money("discount_minor"),
    shippingMinor: money("shipping_minor"),
    taxMinor: money("tax_minor"),
    totalMinor: money("total_minor"),
    currency: currency(),
    stockWarnings: jsonb("stock_warnings")
      .$type<JsonObject[]>()
      .notNull()
      .default([]),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("checkout_proposals_customer_idx").on(table.userId, table.merchantId),
    index("checkout_proposals_cart_idx").on(table.cartId),
    check(
      "checkout_proposals_cart_version_positive",
      sql`${table.cartVersion} > 0`,
    ),
    check(
      "checkout_proposals_amounts_nonnegative",
      sql`${table.subtotalMinor} >= 0 and ${table.discountMinor} >= 0 and ${table.shippingMinor} >= 0 and ${table.taxMinor} >= 0 and ${table.totalMinor} >= 0`,
    ),
  ],
);

export const checkoutProposalItems = pgTable(
  "checkout_proposal_items",
  {
    id: id(),
    proposalId: uuid("proposal_id")
      .notNull()
      .references(() => checkoutProposals.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    nameSnapshot: varchar("name_snapshot", { length: 240 }).notNull(),
    quantity: integer("quantity").notNull(),
    unitPriceMinor: money("unit_price_minor"),
    lineTotalMinor: money("line_total_minor"),
    createdAt: createdAt(),
  },
  (table) => [
    index("checkout_proposal_items_proposal_idx").on(table.proposalId),
    check(
      "checkout_proposal_items_quantity_positive",
      sql`${table.quantity} > 0`,
    ),
    check(
      "checkout_proposal_items_amounts_nonnegative",
      sql`${table.unitPriceMinor} >= 0 and ${table.lineTotalMinor} >= 0`,
    ),
  ],
);

export const policyEvaluations = pgTable(
  "policy_evaluations",
  {
    id: id(),
    proposalId: uuid("proposal_id")
      .notNull()
      .references(() => checkoutProposals.id, { onDelete: "cascade" }),
    policyId: uuid("policy_id").references(() => policies.id, {
      onDelete: "set null",
    }),
    decision: policyDecisionEnum("decision").notNull(),
    reason: text("reason").notNull(),
    input: jsonb("input").$type<JsonObject>().notNull().default({}),
    createdAt: createdAt(),
  },
  (table) => [index("policy_evaluations_proposal_idx").on(table.proposalId)],
);

export const approvals = pgTable(
  "approvals",
  {
    id: id(),
    proposalId: uuid("proposal_id")
      .notNull()
      .references(() => checkoutProposals.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    actionType: varchar("action_type", { length: 120 }).notNull(),
    amountMinor: money("amount_minor"),
    currency: currency(),
    reason: text("reason").notNull(),
    status: approvalStatusEnum("status").notNull().default("PENDING"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("approvals_proposal_unique").on(table.proposalId),
    index("approvals_user_status_idx").on(table.userId, table.status),
    check("approvals_amount_nonnegative", sql`${table.amountMinor} >= 0`),
  ],
);
