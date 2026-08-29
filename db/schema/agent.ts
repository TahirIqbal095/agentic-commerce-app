import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  jsonb,
  pgTable,
  text,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { carts } from "./cart";
import { createdAt, id, updatedAt } from "./columns";
import { agentActionStatusEnum, messageRoleEnum } from "./enums";
import { users } from "./identity";
import type { JsonObject } from "./types";
import type { ConversationContext } from "@/modules/agent/types";

export const conversations = pgTable(
  "conversations",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    activeCartId: uuid("active_cart_id").references(() => carts.id, {
      onDelete: "set null",
    }),
    context: jsonb("context")
      .$type<ConversationContext>()
      .notNull()
      .default({
        schemaVersion: 1,
        revision: 0,
        productConstraints: {
          productTypes: [],
          useCases: [],
          features: [],
          category: null,
          minPriceMinor: null,
          maxPriceMinor: null,
          size: null,
          inStockOnly: true,
          attributes: {},
        },
      }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("conversations_customer_idx").on(table.userId)],
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
    createdAt: createdAt(),
  },
  (table) => [
    index("messages_conversation_created_idx").on(
      table.conversationId,
      table.createdAt,
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
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
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
