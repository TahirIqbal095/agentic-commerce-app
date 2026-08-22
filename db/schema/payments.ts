import { sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { createdAt, currency, id, money, updatedAt } from "./columns";
import { paymentProviderEnum, paymentStatusEnum } from "./enums";
import { orders } from "./ordering";
import type { JsonObject } from "./types";

export const paymentAttempts = pgTable(
  "payment_attempts",
  {
    id: id(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    provider: paymentProviderEnum("provider").notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 200 }).notNull(),
    providerOrderId: varchar("provider_order_id", { length: 200 }),
    providerPaymentId: varchar("provider_payment_id", { length: 200 }),
    amountMinor: money("amount_minor"),
    currency: currency(),
    status: paymentStatusEnum("status").notNull().default("CREATED"),
    failureCode: varchar("failure_code", { length: 160 }),
    failureReason: text("failure_reason"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("payment_attempts_idempotency_unique").on(table.idempotencyKey),
    uniqueIndex("payment_attempts_provider_order_unique")
      .on(table.provider, table.providerOrderId)
      .where(sql`${table.providerOrderId} is not null`),
    uniqueIndex("payment_attempts_provider_payment_unique")
      .on(table.provider, table.providerPaymentId)
      .where(sql`${table.providerPaymentId} is not null`),
    index("payment_attempts_order_idx").on(table.orderId),
    check("payment_attempts_amount_nonnegative", sql`${table.amountMinor} >= 0`),
  ],
);

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: id(),
    provider: paymentProviderEnum("provider").notNull(),
    providerEventId: varchar("provider_event_id", { length: 240 }).notNull(),
    eventType: varchar("event_type", { length: 160 }).notNull(),
    payload: jsonb("payload").$type<JsonObject>().notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("webhook_events_provider_event_unique").on(
      table.provider,
      table.providerEventId,
    ),
  ],
);
