import {
  bigint,
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { createdAt, id } from "./columns";
import { actorTypeEnum } from "./enums";
import type { JsonObject } from "./types";

/**
 * The append-only record of meaningful actions, decisions, state changes, and
 * external notifications.
 *
 * A consequential checkout event carries everything needed to explain payment
 * behavior later: who acted, why, what changed, for how much, under which
 * Payment Account, and which correlated records it belongs to. Under ADR-0015
 * it never carries credentials, authorization headers, signatures, payment
 * instrument data, OTPs, raw provider payloads, Conversation text, or model
 * reasoning.
 *
 * `guestSessionId` is stored by value with no foreign key, so protected
 * evidence outlives the browser credential that produced it (ADR-0011).
 */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: id(),
    guestSessionId: uuid("guest_session_id"),
    sessionId: varchar("session_id", { length: 200 }),
    entityType: varchar("entity_type", { length: 120 }).notNull(),
    entityId: varchar("entity_id", { length: 240 }).notNull(),
    actorType: actorTypeEnum("actor_type").notNull(),
    eventType: varchar("event_type", { length: 160 }).notNull(),
    message: text("message").notNull(),
    /** The deterministic, machine-readable half of the event's reason. */
    reasonCode: varchar("reason_code", { length: 120 }),
    /** Ties every event of one checkout together, usually the Order. */
    correlationId: uuid("correlation_id"),
    priorState: varchar("prior_state", { length: 60 }),
    newState: varchar("new_state", { length: 60 }),
    amountMinor: bigint("amount_minor", { mode: "number" }),
    currency: varchar("currency", { length: 3 }),
    environmentMode: varchar("environment_mode", { length: 20 }),
    /** The idempotency or operation key the acting command carried. */
    operationKey: varchar("operation_key", { length: 200 }),
    /** A safe provider identifier, such as a Provider Order or receipt. */
    providerReference: varchar("provider_reference", { length: 200 }),
    /** Whether the Checkout Timeline may project this event to a Customer. */
    customerVisible: boolean("customer_visible").notNull().default(false),
    /** The collapsed technical line, free of secrets and provider payloads. */
    detail: text("detail"),
    metadata: jsonb("metadata").$type<JsonObject>().notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: createdAt(),
  },
  (table) => [
    index("audit_events_created_idx").on(table.createdAt),
    index("audit_events_entity_idx").on(table.entityType, table.entityId),
    index("audit_events_correlation_idx").on(
      table.correlationId,
      table.occurredAt,
    ),
  ],
);
