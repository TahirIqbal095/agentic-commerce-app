import { index, jsonb, pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";
import { createdAt, id } from "./columns";
import { actorTypeEnum } from "./enums";
import { guestSessions } from "./identity";
import type { JsonObject } from "./types";

export const auditEvents = pgTable(
  "audit_events",
  {
    id: id(),
    guestSessionId: uuid("guest_session_id").references(
      () => guestSessions.id,
      { onDelete: "restrict" },
    ),
    sessionId: varchar("session_id", { length: 200 }),
    entityType: varchar("entity_type", { length: 120 }).notNull(),
    entityId: varchar("entity_id", { length: 240 }).notNull(),
    actorType: actorTypeEnum("actor_type").notNull(),
    eventType: varchar("event_type", { length: 160 }).notNull(),
    message: text("message").notNull(),
    metadata: jsonb("metadata").$type<JsonObject>().notNull().default({}),
    createdAt: createdAt(),
  },
  (table) => [
    index("audit_events_created_idx").on(table.createdAt),
    index("audit_events_entity_idx").on(table.entityType, table.entityId),
  ],
);
