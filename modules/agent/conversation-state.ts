import { and, asc, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { agentActions, conversations, messages } from "@/db/schema/agent";
import { auditEvents } from "@/db/schema/audit";
import { isAgentOutcome, type AgentOutcome } from "./agent-outcome";
import {
  createEmptyConversationContext,
  parseConversationContext,
  type ShoppingIntent,
} from "./intent";

export type ConversationTranscriptTurn = {
  id: string;
  customerMessage: string;
  result: AgentOutcome | null;
  error: string | null;
};

export type CurrentConversation = {
  conversationId: string;
  transcript: ConversationTranscriptTurn[];
  contextSummary: ShoppingIntent;
  revision: number;
};

export interface ConversationState {
  loadCurrent(): Promise<CurrentConversation | null>;
  resetCurrent(): Promise<void>;
}

export function createConversationState(
  guestSessionId: string,
): ConversationState {
  return {
    async loadCurrent() {
      const [current] = await db
        .select({ id: conversations.id, context: conversations.context })
        .from(conversations)
        .where(
          and(
            eq(conversations.guestSessionId, guestSessionId),
            isNull(conversations.closedAt),
          ),
        )
        .limit(1);
      if (!current) return null;

      const transcriptRows = await db
        .select({
          id: messages.id,
          content: messages.content,
          metadata: messages.metadata,
        })
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, current.id),
            eq(messages.role, "CUSTOMER"),
          ),
        )
        .orderBy(asc(messages.createdAt), asc(messages.id));
      const context = parseConversationContext(current.context);
      return {
        conversationId: current.id,
        transcript: transcriptRows.map((row) => {
          const outcome = row.metadata.agentOutcome;
          const persistedOutcome = isAgentOutcome(outcome) ? outcome : null;
          const error =
            persistedOutcome?.status === "TEMPORARILY_UNAVAILABLE"
              ? persistedOutcome.message
              : null;
          return {
            id: row.id,
            customerMessage: row.content,
            result: error ? null : persistedOutcome,
            error,
          };
        }),
        contextSummary: context.productConstraints,
        revision: context.revision,
      };
    },

    async resetCurrent() {
      await db.transaction(async (transaction) => {
        const [current] = await transaction
          .select({ id: conversations.id })
          .from(conversations)
          .where(
            and(
              eq(conversations.guestSessionId, guestSessionId),
              isNull(conversations.closedAt),
            ),
          )
          .limit(1);
        if (!current) return;

        const [[action], [audit]] = await Promise.all([
          transaction
            .select({ id: agentActions.id })
            .from(agentActions)
            .where(eq(agentActions.conversationId, current.id))
            .limit(1),
          transaction
            .select({ id: auditEvents.id })
            .from(auditEvents)
            .where(
              and(
                eq(auditEvents.entityId, current.id),
                or(
                  eq(auditEvents.entityType, "Conversation"),
                  eq(auditEvents.entityType, "CONVERSATION"),
                ),
              ),
            )
            .limit(1),
        ]);
        if (!action && !audit) {
          await transaction
            .delete(conversations)
            .where(eq(conversations.id, current.id));
          return;
        }

        await transaction
          .delete(messages)
          .where(eq(messages.conversationId, current.id));
        await transaction
          .update(conversations)
          .set({
            closedAt: new Date(),
            context: createEmptyConversationContext(),
            updatedAt: new Date(),
          })
          .where(eq(conversations.id, current.id));
      });
    },
  };
}
