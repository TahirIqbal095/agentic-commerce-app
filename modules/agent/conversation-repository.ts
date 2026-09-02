import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import type { DbExecutor } from "@/db";
import { conversations, messages } from "@/db/schema/agent";
import type { JsonObject } from "@/db/schema/types";
import { isAgentOutcome, type AgentOutcome } from "./agent-outcome";
import {
  outcomeMetadata,
  redactSensitiveText,
  sanitizeValue,
} from "./conversation-privacy";
import {
  createEmptyConversationContext,
  parseConversationContext,
  type ConversationContext,
  type RecommendationReference,
} from "./intent";

type ConversationOwner = { guestSessionId: string };
export interface ConversationRepository {
  /**
   * Returns the completed outcome for a turn with the same idempotency key, if
   * one has already been accepted for this Customer.
   */
  findDuplicate(
    owner: ConversationOwner,
    conversationId: string | undefined,
    idempotencyKey: string,
  ): Promise<AgentOutcome | null>;
  /**
   * Creates or reuses an open Conversation and records its first Customer message.
   */
  create(
    owner: ConversationOwner,
    customerMessage: string,
    idempotencyKey: string,
  ): Promise<{
    conversationId: string;
    customerMessageId: string;
    context: ConversationContext;
  }>;
  /** Loads the owner and parsed context for an open Conversation. */
  findOwnedContext(
    conversationId: string,
  ): Promise<(ConversationOwner & { context: ConversationContext }) | null>;
  /**
   * Saves the next Context revision and current Customer-message metadata
   * atomically, returning `false` when optimistic concurrency fails.
   */
  saveContextAndMetadata(
    conversationId: string,
    context: ConversationContext,
    messageId: string,
    metadata: JsonObject,
  ): Promise<boolean | void>;
  /** Appends a message and returns its generated ID. */
  append(
    conversationId: string,
    role: "CUSTOMER" | "ASSISTANT",
    content: string,
    metadata?: JsonObject,
    idempotencyKey?: string,
  ): Promise<string>;
  /** Atomically stores a completed ASSISTANT turn and its typed outcome. */
  finalizeTurn?(
    conversationId: string,
    customerMessageId: string,
    content: string,
    outcome: AgentOutcome,
    executor?: DbExecutor,
  ): Promise<void>;
  /**
   * Replaces recommendation memory only when Context is still at the expected
   * revision.
   */
  saveRecommendationSet?(
    conversationId: string,
    expectedRevision: number,
    recommendations: RecommendationReference[],
  ): Promise<boolean>;
}

export const postgresConversationRepository: ConversationRepository = {
  /**
   * Finds the completed outcome for a previously accepted turn.
   *
   * If the matching message exists but its outcome has not been persisted yet,
   * this method waits with exponential backoff so concurrent duplicate requests
   * can return the original result instead of processing the turn twice.
   *
   * @param owner - Customer whose Conversations may be searched.
   * @param conversationId - Conversation to restrict the search to, or
   * `undefined` when the first turn has not returned a Conversation ID yet.
   * @param idempotencyKey - Client-generated key that uniquely identifies the
   * turn.
   * @returns The original Agent outcome, or `null` when no matching turn exists.
   * @throws When a matching turn remains incomplete after the retry window.
   */
  async findDuplicate(owner, conversationId, idempotencyKey) {
    for (let attempt = 0; attempt < 35; attempt += 1) {
      const [duplicate] = await db
        .select({
          conversationId: conversations.id,
          metadata: messages.metadata,
        })
        .from(messages)
        .innerJoin(conversations, eq(messages.conversationId, conversations.id))
        .where(
          and(
            eq(conversations.guestSessionId, owner.guestSessionId),
            isNull(conversations.closedAt),
            eq(messages.idempotencyKey, idempotencyKey),
            ...(conversationId ? [eq(conversations.id, conversationId)] : []),
          ),
        )
        .limit(1);
      if (!duplicate) return null;
      const outcome = duplicate.metadata.agentOutcome;
      if (isAgentOutcome(outcome)) return outcome;
      await waitForOutcome(Math.min(50 * 2 ** attempt, 1_000));
    }
    throw new Error("The original Conversation Turn is still processing.");
  },
  /**
   * Creates or reuses the Customer's open Conversation and records its first
   * Customer message atomically.
   *
   * A concurrent insert may win the open-Conversation uniqueness race. In that
   * case, the winning Conversation is loaded and used for the new message.
   *
   * @param owner - Customer who owns the Conversation.
   * @param customerMessage - Redacted text of the Customer's first message.
   * @param idempotencyKey - Client-generated key used to deduplicate the turn.
   * @returns IDs for the Conversation and Customer message, plus parsed persisted
   * context.
   * @throws When no open Conversation can be created or recovered.
   */
  async create(owner, customerMessage, idempotencyKey) {
    return db.transaction(async (transaction) => {
      const conversation = await openCurrentConversation(
        transaction,
        owner.guestSessionId,
      );
      const [message] = await transaction
        .insert(messages)
        .values({
          conversationId: conversation.id,
          role: "CUSTOMER",
          content: customerMessage,
          idempotencyKey,
        })
        .returning({ id: messages.id });
      return {
        conversationId: conversation.id,
        customerMessageId: message.id,
        context: conversation.context,
      };
    });
  },
  /**
   * Loads the owner and parsed context of an open Conversation.
   *
   * @param conversationId - Conversation to load.
   * @returns The owning Customer and Conversation Context, or `null` when the
   * Conversation does not exist or has been closed.
   */
  async findOwnedContext(conversationId) {
    const [ownedContext] = await db
      .select({
        guestSessionId: conversations.guestSessionId,
        context: conversations.context,
      })
      .from(conversations)
      .where(
        and(
          eq(conversations.id, conversationId),
          isNull(conversations.closedAt),
        ),
      )
      .limit(1);
    return ownedContext
      ? {
          ...ownedContext,
          context: parseConversationContext(ownedContext.context),
        }
      : null;
  },
  /**
   * Advances Conversation Context and attaches metadata to the current Customer
   * message in one transaction.
   *
   * The context update uses its revision as an optimistic-concurrency check, so
   * stale turns cannot overwrite a newer context.
   *
   * @param conversationId - Open Conversation being updated.
   * @param context - Next Conversation Context; its revision must be exactly one
   * greater than the persisted revision.
   * @param messageId - Customer message that initiated the context change.
   * @param metadata - Sanitized, inspectable metadata to store on that message.
   * @returns `true` when both records are updated, or `false` after a revision
   * conflict or when the Conversation is unavailable.
   */
  async saveContextAndMetadata(conversationId, context, messageId, metadata) {
    return db.transaction(async (transaction) => {
      const [updated] = await transaction
        .update(conversations)
        .set({ context, updatedAt: new Date() })
        .where(
          and(
            eq(conversations.id, conversationId),
            isNull(conversations.closedAt),
            sql`${conversations.context}->>'revision' = ${String(context.revision - 1)}`,
          ),
        )
        .returning({ id: conversations.id });
      if (!updated) return false;
      await transaction
        .update(messages)
        .set({ metadata })
        .where(eq(messages.id, messageId));
      return true;
    });
  },
  /**
   * Appends a message and refreshes the Conversation's activity timestamp in a
   * single transaction.
   *
   * @param conversationId - Conversation receiving the message.
   * @param role - Whether the message was written by the Customer or ASSISTANT.
   * @param content - Text to persist. Callers must redact sensitive Customer text.
   * @param metadata - Optional structured data associated with the message.
   * @param idempotencyKey - Optional client key used to deduplicate Customer turns.
   * @returns The ID of the newly persisted message.
   */
  async append(conversationId, role, content, metadata = {}, idempotencyKey) {
    return db.transaction(async (transaction) => {
      const [message] = await transaction
        .insert(messages)
        .values({ conversationId, role, content, metadata, idempotencyKey })
        .returning({ id: messages.id });
      await transaction
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, conversationId));
      return message.id;
    });
  },
  /**
   * Completes a turn by persisting the ASSISTANT response and making the
   * sanitized Agent outcome discoverable from the initiating Customer message.
   *
   * All writes, including the Conversation activity update, are committed in a
   * single transaction so duplicate requests cannot observe a partial outcome.
   *
   * @param conversationId - Conversation containing the completed turn.
   * @param customerMessageId - Customer message that initiated the turn.
   * @param content - ASSISTANT response; sensitive text is redacted before
   * persistence.
   * @param outcome - Typed result returned by the Agent for this turn.
   */
  async finalizeTurn(conversationId, customerMessageId, content, outcome, executor) {
    const finalize = async (transaction: DbExecutor) => {
      const [customerMessage] = await transaction
        .select({ metadata: messages.metadata })
        .from(messages)
        .where(eq(messages.id, customerMessageId))
        .limit(1);
      await transaction.insert(messages).values({
        conversationId,
        role: "ASSISTANT",
        content: redactSensitiveText(content),
        metadata: outcomeMetadata(outcome),
      });
      await transaction
        .update(messages)
        .set({
          metadata: {
            ...(customerMessage?.metadata ?? {}),
            agentOutcome: sanitizeValue(outcome) as JsonObject,
          },
        })
        .where(eq(messages.id, customerMessageId));
      await transaction
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, conversationId));
    };
    if (executor) {
      await finalize(executor);
      return;
    }
    await db.transaction(finalize);
  },
  /**
   * Stores a bounded summary of the latest Product recommendations in the
   * Conversation Context.
   *
   * The expected revision prevents recommendations produced from stale context
   * from replacing a newer set.
   *
   * @param conversationId - Conversation whose recommendation set is updated.
   * @param expectedRevision - Context revision used to produce the results.
   * @param recommendations - Minimized Product references safe to retain for a
   * later turn.
   * @returns `true` when the set is saved, or `false` when the Conversation is
   * unavailable or its context revision has changed.
   */
  async saveRecommendationSet(
    conversationId,
    expectedRevision,
    recommendations,
  ) {
    const [current] = await db
      .select({ context: conversations.context })
      .from(conversations)
      .where(
        and(
          eq(conversations.id, conversationId),
          isNull(conversations.closedAt),
        ),
      )
      .limit(1);
    if (!current) return false;
    const context = parseConversationContext(current.context);
    if (context.revision !== expectedRevision) return false;
    const [updated] = await db
      .update(conversations)
      .set({
        context: { ...context, latestRecommendationSet: recommendations },
      })
      .where(
        and(
          eq(conversations.id, conversationId),
          sql`${conversations.context}->>'revision' = ${String(expectedRevision)}`,
        ),
      )
      .returning({ id: conversations.id });
    return Boolean(updated);
  },
};

/**
 * Returns the Customer's open Conversation, creating it when they have none.
 *
 * A concurrent request may win the one-open-Conversation uniqueness race, so
 * the winning Conversation is reread and used rather than treated as a failure.
 * Every Conversation record a Customer can produce — a typed Conversation Turn
 * or a Customer Action Entry — enters through here, so they can never create
 * two open Conversations between them.
 *
 * @param executor - Executor of the calling transaction.
 * @param guestSessionId - Guest Session that owns the Conversation.
 * @returns The open Conversation's ID and parsed Conversation Context.
 * @throws When no open Conversation can be created or recovered.
 */
export async function openCurrentConversation(
  executor: DbExecutor,
  guestSessionId: string,
): Promise<{ id: string; context: ConversationContext }> {
  const findOpen = async () => {
    const [open] = await executor
      .select({ id: conversations.id, context: conversations.context })
      .from(conversations)
      .where(
        and(
          eq(conversations.guestSessionId, guestSessionId),
          isNull(conversations.closedAt),
        ),
      )
      .limit(1);
    return open ?? null;
  };

  const existing = await findOpen();
  const [inserted] = existing
    ? []
    : await executor
        .insert(conversations)
        .values({ guestSessionId, context: createEmptyConversationContext() })
        .onConflictDoNothing()
        .returning({ id: conversations.id, context: conversations.context });
  const conversation = existing ?? inserted ?? (await findOpen());
  if (!conversation) {
    throw new Error("The current Conversation could not be created.");
  }
  return {
    id: conversation.id,
    context: parseConversationContext(conversation.context),
  };
}

/**
 * Pauses duplicate polling without blocking the event loop.
 *
 * @param delayMs - Number of milliseconds to wait.
 * @returns A promise that resolves after the delay.
 */
function waitForOutcome(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
