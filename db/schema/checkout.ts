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
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { createdAt, currency, id, money, updatedAt } from "./columns";
import {
  checkoutProposalStatusEnum,
  orderStatusEnum,
  paymentAttemptStatusEnum,
  paymentEnvironmentEnum,
  providerOperationStatusEnum,
} from "./enums";
import { guestSessions } from "./identity";
import { products } from "./catalog";
import type { CheckoutProposalLine } from "@/modules/checkout/checkout-proposal";

/**
 * Checkout Proposals and Approvals are guest-owned, so they cascade with the
 * Guest Session that created them. Everything from the Order onward is
 * protected commerce evidence under ADR-0011: those tables reference the Guest
 * Session and the proposal by value rather than by foreign key, so an expired
 * browser credential ends Customer access without deleting the Brand's
 * reconciliation record.
 */
export const checkoutProposals = pgTable(
  "checkout_proposals",
  {
    id: id(),
    guestSessionId: uuid("guest_session_id")
      .notNull()
      .references(() => guestSessions.id, { onDelete: "cascade" }),
    commandKey: uuid("command_key").notNull(),
    cartId: uuid("cart_id").notNull(),
    cartVersion: integer("cart_version").notNull(),
    currency: currency(),
    lines: jsonb("lines").$type<CheckoutProposalLine[]>().notNull(),
    itemsSubtotalMinor: money("items_subtotal_minor"),
    discountMinor: money("discount_minor"),
    shippingMinor: money("shipping_minor"),
    taxMinor: money("tax_minor"),
    checkoutTotalMinor: money("checkout_total_minor"),
    policyResult: varchar("policy_result", { length: 40 }).notNull(),
    policyReasonCode: varchar("policy_reason_code", { length: 120 }).notNull(),
    policyExplanation: text("policy_explanation").notNull(),
    status: checkoutProposalStatusEnum("status").notNull().default("ACTIVE"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("checkout_proposals_command_key_unique").on(
      table.guestSessionId,
      table.commandKey,
    ),
    index("checkout_proposals_cart_idx").on(table.cartId, table.cartVersion),
    check("checkout_proposals_currency_inr", sql`${table.currency} = 'INR'`),
    check(
      "checkout_proposals_zero_adjustments",
      sql`${table.discountMinor} = 0 and ${table.shippingMinor} = 0 and ${table.taxMinor} = 0`,
    ),
    check(
      "checkout_proposals_total_matches_subtotal",
      sql`${table.checkoutTotalMinor} = ${table.itemsSubtotalMinor}`,
    ),
    check(
      "checkout_proposals_total_within_bounds",
      sql`${table.checkoutTotalMinor} between 100 and 5000000`,
    ),
  ],
);

/**
 * A Customer's explicit, expiring authorization for one exact Checkout
 * Proposal. The unique proposal index makes reuse for a second Cart or amount
 * impossible rather than merely refused, and the idempotency key makes a
 * double-clicked submission resolve to the Approval already recorded.
 */
export const checkoutApprovals = pgTable(
  "checkout_approvals",
  {
    id: id(),
    proposalId: uuid("proposal_id")
      .notNull()
      .references(() => checkoutProposals.id, { onDelete: "cascade" }),
    guestSessionId: uuid("guest_session_id")
      .notNull()
      .references(() => guestSessions.id, { onDelete: "cascade" }),
    approvalKey: uuid("approval_key").notNull(),
    approvedTotalMinor: money("approved_total_minor"),
    currency: currency(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("checkout_approvals_proposal_unique").on(table.proposalId),
    uniqueIndex("checkout_approvals_key_unique").on(
      table.guestSessionId,
      table.approvalKey,
    ),
    check("checkout_approvals_currency_inr", sql`${table.currency} = 'INR'`),
  ],
);

/**
 * The durable, immutable commercial record created from an approved Checkout
 * Proposal, before any external payment begins.
 *
 * `proposalId` is unique but unreferenced: one Order per Checkout Proposal is
 * enforced without tying the Order's lifetime to the guest-owned proposal.
 */
export const orders = pgTable(
  "orders",
  {
    id: id(),
    guestSessionId: uuid("guest_session_id").notNull(),
    proposalId: uuid("proposal_id").notNull(),
    approvalId: uuid("approval_id").notNull(),
    cartId: uuid("cart_id").notNull(),
    cartVersion: integer("cart_version").notNull(),
    currency: currency(),
    itemsSubtotalMinor: money("items_subtotal_minor"),
    discountMinor: money("discount_minor"),
    shippingMinor: money("shipping_minor"),
    taxMinor: money("tax_minor"),
    totalMinor: money("total_minor"),
    status: orderStatusEnum("status").notNull().default("PAYMENT_SETUP"),
    environmentMode: paymentEnvironmentEnum("environment_mode")
      .notNull()
      .default("TEST"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("orders_proposal_unique").on(table.proposalId),
    uniqueIndex("orders_approval_unique").on(table.approvalId),
    index("orders_guest_session_idx").on(table.guestSessionId),
    check("orders_currency_inr", sql`${table.currency} = 'INR'`),
    check(
      "orders_total_matches_subtotal",
      sql`${table.totalMinor} = ${table.itemsSubtotalMinor}`,
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
    productName: varchar("product_name", { length: 200 }).notNull(),
    quantity: integer("quantity").notNull(),
    unitPriceMinor: money("unit_price_minor"),
    lineTotalMinor: money("line_total_minor"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("order_items_product_unique").on(table.orderId, table.productId),
    check("order_items_quantity_range", sql`${table.quantity} between 1 and 10`),
    check(
      "order_items_line_total_calculates",
      sql`${table.lineTotalMinor} = ${table.quantity} * ${table.unitPriceMinor}`,
    ),
  ],
);

/**
 * The retry-safe logical execution of one Provider Write.
 *
 * Its own UUID becomes Razorpay's unique receipt, so a lost response is
 * recovered by looking the receipt up rather than by writing again. The unique
 * index on (order, operation type) is what makes "one logical `create_order`
 * per Approval" a database fact rather than an application intention.
 */
export const providerOperations = pgTable(
  "provider_operations",
  {
    id: id(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    operationType: varchar("operation_type", { length: 60 })
      .notNull()
      .default("CREATE_ORDER"),
    status: providerOperationStatusEnum("status").notNull().default("READY"),
    transportAttempts: integer("transport_attempts").notNull().default(0),
    reconciliationReads: integer("reconciliation_reads").notNull().default(0),
    lastReasonCode: varchar("last_reason_code", { length: 120 }),
    blockedReason: text("blocked_reason"),
    environmentMode: paymentEnvironmentEnum("environment_mode")
      .notNull()
      .default("TEST"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("provider_operations_one_per_order_unique").on(
      table.orderId,
      table.operationType,
    ),
    check(
      "provider_operations_reads_bounded",
      sql`${table.reconciliationReads} between 0 and 3`,
    ),
  ],
);

/**
 * Razorpay's payment collection record for one internal Order. The unique
 * index on `orderId` is ADR-0013's one-Provider-Order-per-Order rule; the
 * unique receipt is what makes reconciliation after an Unknown Provider
 * Outcome safe.
 */
export const providerOrders = pgTable(
  "provider_orders",
  {
    id: id(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    operationId: uuid("operation_id")
      .notNull()
      .references(() => providerOperations.id, { onDelete: "restrict" }),
    providerOrderId: varchar("provider_order_id", { length: 120 }).notNull(),
    receipt: varchar("receipt", { length: 120 }).notNull(),
    amountMinor: money("amount_minor"),
    currency: currency(),
    providerStatus: varchar("provider_status", { length: 40 }).notNull(),
    notes: jsonb("notes").$type<Record<string, string>>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("provider_orders_one_per_order_unique").on(table.orderId),
    uniqueIndex("provider_orders_provider_id_unique").on(table.providerOrderId),
    uniqueIndex("provider_orders_receipt_unique").on(table.receipt),
    check("provider_orders_currency_inr", sql`${table.currency} = 'INR'`),
  ],
);

/**
 * One explicit launch of managed Razorpay Checkout against a Provider Order.
 * The bounded attempt number makes "at most three launches" a constraint, so a
 * racing double-click cannot buy a fourth.
 */
export const paymentAttempts = pgTable(
  "payment_attempts",
  {
    id: id(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    providerOrderId: varchar("provider_order_id", { length: 120 }).notNull(),
    attemptNumber: integer("attempt_number").notNull(),
    status: paymentAttemptStatusEnum("status").notNull().default("OPENED"),
    openedAt: createdAt(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("payment_attempts_number_unique").on(
      table.orderId,
      table.attemptNumber,
    ),
    check(
      "payment_attempts_number_bounded",
      sql`${table.attemptNumber} between 1 and 3`,
    ),
  ],
);

/**
 * Razorpay's record of one attempt to authorize and collect funds. It is
 * recorded independently of the Payment Attempt that opened it, because
 * asynchronous provider evidence can arrive before, after, or without the
 * browser's own account of the same payment.
 */
export const providerPayments = pgTable(
  "provider_payments",
  {
    id: id(),
    providerPaymentId: varchar("provider_payment_id", {
      length: 120,
    }).notNull(),
    providerOrderId: varchar("provider_order_id", { length: 120 }).notNull(),
    paymentAttemptId: uuid("payment_attempt_id").references(
      () => paymentAttempts.id,
      { onDelete: "set null" },
    ),
    providerStatus: varchar("provider_status", { length: 40 }).notNull(),
    captured: boolean("captured").notNull().default(false),
    amountMinor: money("amount_minor"),
    currency: currency(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("provider_payments_provider_id_unique").on(
      table.providerPaymentId,
    ),
    index("provider_payments_order_idx").on(table.providerOrderId),
  ],
);

/**
 * The durable inbox for authenticated Provider Notifications.
 *
 * The Razorpay event ID is unique, so a repeated delivery is recognized rather
 * than applied twice. An event that arrives before its Provider Order can be
 * associated stays here unapplied until association is safe, instead of being
 * discarded or guessed at. Under ADR-0015 only selected fields are retained —
 * never the raw payload or its signature.
 */
export const providerNotifications = pgTable(
  "provider_notifications",
  {
    id: id(),
    eventId: varchar("event_id", { length: 160 }).notNull(),
    eventType: varchar("event_type", { length: 120 }).notNull(),
    providerOrderId: varchar("provider_order_id", { length: 120 }),
    providerPaymentId: varchar("provider_payment_id", { length: 120 }),
    providerStatus: varchar("provider_status", { length: 40 }),
    amountMinor: bigint("amount_minor", { mode: "number" }),
    currency: varchar("currency", { length: 3 }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    receivedAt: createdAt(),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("provider_notifications_event_unique").on(table.eventId),
    index("provider_notifications_pending_idx")
      .on(table.providerOrderId)
      .where(sql`${table.appliedAt} is null`),
  ],
);
