import { sql } from "drizzle-orm";
import {
  bigint,
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
import { createdAt, id, updatedAt } from "./columns";
import { agentActionStatusEnum, messageRoleEnum } from "./enums";
import { guestSessions } from "./identity";
import type { JsonObject } from "./types";
import {
  createEmptyConversationContext,
  type ConversationContext,
} from "@/modules/agent/intent";

export const conversations = pgTable(
  "conversations",
  {
    id: id(),
    guestSessionId: uuid("guest_session_id")
      .notNull()
      .references(() => guestSessions.id, { onDelete: "cascade" }),
    context: jsonb("context")
      .$type<ConversationContext>()
      .notNull()
      .default(createEmptyConversationContext()),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("conversations_guest_session_idx").on(table.guestSessionId),
    uniqueIndex("conversations_one_current_per_guest_session_unique")
      .on(table.guestSessionId)
      .where(sql`${table.closedAt} is null`),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: id(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: messageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    metadata: jsonb("metadata").$type<JsonObject>().notNull().default({}),
    idempotencyKey: uuid("idempotency_key"),
    createdAt: createdAt(),
  },
  (table) => [
    index("messages_conversation_created_idx").on(
      table.conversationId,
      table.createdAt,
    ),
    uniqueIndex("messages_conversation_idempotency_key_unique").on(
      table.conversationId,
      table.idempotencyKey,
    ),
  ],
);

export const agentActions = pgTable(
  "agent_actions",
  {
    id: id(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "restrict" }),
    guestSessionId: uuid("guest_session_id")
      .notNull()
      .references(() => guestSessions.id, { onDelete: "restrict" }),
    actionType: varchar("action_type", { length: 120 }).notNull(),
    toolName: varchar("tool_name", { length: 120 }).notNull(),
    input: jsonb("input").$type<JsonObject>().notNull(),
    output: jsonb("output").$type<JsonObject>(),
    reason: text("reason").notNull(),
    status: agentActionStatusEnum("status").notNull().default("PROPOSED"),
    moneyImpactMinor: bigint("money_impact_minor", { mode: "number" }),
    currency: varchar("currency", { length: 3 }),
    createdAt: createdAt(),
  },
  (table) => [
    index("agent_actions_conversation_idx").on(
      table.conversationId,
      table.createdAt,
    ),
    check(
      "agent_actions_money_impact_nonnegative",
      sql`${table.moneyImpactMinor} is null or ${table.moneyImpactMinor} >= 0`,
    ),
  ],
);
