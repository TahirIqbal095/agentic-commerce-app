import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema/agent";
import type { JsonObject } from "@/db/schema/types";
import type { ConversationModule } from "./commerce-agent";
import { isAgentOutcome } from "./agent-outcome";
import {
  createEmptyConversationContext,
  parseConversationContext,
} from "./conversation-context";
import type {
  AgentOutcome,
  ConversationContext,
  IntentBrief,
  RecommendationReference,
} from "./types";

type ConversationOwner = { userId: string };
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
   * Creates or reuses an open Conversation and records its first USER message.
   */
  create(
    owner: ConversationOwner,
    userMessage: string,
    idempotencyKey: string,
  ): Promise<{
    conversationId: string;
    userMessageId: string;
    context: ConversationContext;
  }>;
  /** Loads the owner and parsed context for an open Conversation. */
  findOwnedContext(
    conversationId: string,
  ): Promise<(ConversationOwner & { context: ConversationContext }) | null>;
  /**
   * Saves the next Context revision and current USER-message metadata
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
    role: "USER" | "ASSISTANT",
    content: string,
    metadata?: JsonObject,
    idempotencyKey?: string,
  ): Promise<string>;
  /** Atomically stores a completed ASSISTANT turn and its typed outcome. */
  finalizeTurn?(
    conversationId: string,
    userMessageId: string,
    content: string,
    outcome: AgentOutcome,
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

export class ConversationAccessError extends Error {
  /**
   * Creates the error returned when a Conversation is missing, closed, or
   * belongs to a different Customer.
   */
  constructor() {
    super("The conversation was not found.");
    this.name = "ConversationAccessError";
  }
}

const postgresConversationRepository: ConversationRepository = {
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
            eq(conversations.userId, owner.userId),
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
   * USER message atomically.
   *
   * A concurrent insert may win the open-Conversation uniqueness race. In that
   * case, the winning Conversation is loaded and used for the new message.
   *
   * @param owner - Customer who owns the Conversation.
   * @param userMessage - Redacted text of the Customer's first message.
   * @param idempotencyKey - Client-generated key used to deduplicate the turn.
   * @returns IDs for the Conversation and USER message, plus parsed persisted
   * context.
   * @throws When no open Conversation can be created or recovered.
   */
  async create(owner, userMessage, idempotencyKey) {
    return db.transaction(async (transaction) => {
      const context = createEmptyConversationContext();
      const [existing] = await transaction
        .select({ id: conversations.id, context: conversations.context })
        .from(conversations)
        .where(
          and(
            eq(conversations.userId, owner.userId),
            isNull(conversations.closedAt),
          ),
        )
        .limit(1);
      const [inserted] = existing
        ? []
        : await transaction
            .insert(conversations)
            .values({ ...owner, context })
            .onConflictDoNothing()
            .returning({
              id: conversations.id,
              context: conversations.context,
            });
      const [concurrent] =
        existing || inserted
          ? []
          : await transaction
              .select({ id: conversations.id, context: conversations.context })
              .from(conversations)
              .where(
                and(
                  eq(conversations.userId, owner.userId),
                  isNull(conversations.closedAt),
                ),
              )
              .limit(1);
      const conversation = existing ?? inserted ?? concurrent;
      if (!conversation) {
        throw new Error("The current Conversation could not be created.");
      }
      const [message] = await transaction
        .insert(messages)
        .values({
          conversationId: conversation.id,
          role: "USER",
          content: userMessage,
          idempotencyKey,
        })
        .returning({ id: messages.id });
      return {
        conversationId: conversation.id,
        userMessageId: message.id,
        context: parseConversationContext(conversation.context),
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
        userId: conversations.userId,
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
   * Advances Conversation Context and attaches metadata to the current USER
   * message in one transaction.
   *
   * The context update uses its revision as an optimistic-concurrency check, so
   * stale turns cannot overwrite a newer context.
   *
   * @param conversationId - Open Conversation being updated.
   * @param context - Next Conversation Context; its revision must be exactly one
   * greater than the persisted revision.
   * @param messageId - USER message that initiated the context change.
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
   * @param role - Whether the message was written by the USER or ASSISTANT.
   * @param content - Text to persist. Callers must redact sensitive USER text.
   * @param metadata - Optional structured data associated with the message.
   * @param idempotencyKey - Optional client key used to deduplicate USER turns.
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
   * sanitized Agent outcome discoverable from the initiating USER message.
   *
   * All writes, including the Conversation activity update, are committed in a
   * single transaction so duplicate requests cannot observe a partial outcome.
   *
   * @param conversationId - Conversation containing the completed turn.
   * @param userMessageId - USER message that initiated the turn.
   * @param content - ASSISTANT response; sensitive text is redacted before
   * persistence.
   * @param outcome - Typed result returned by the Agent for this turn.
   */
  async finalizeTurn(conversationId, userMessageId, content, outcome) {
    await db.transaction(async (transaction) => {
      const [userMessage] = await transaction
        .select({ metadata: messages.metadata })
        .from(messages)
        .where(eq(messages.id, userMessageId))
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
            ...(userMessage?.metadata ?? {}),
            agentOutcome: sanitizeValue(outcome) as JsonObject,
          },
        })
        .where(eq(messages.id, userMessageId));
      await transaction
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, conversationId));
    });
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
 * Pauses duplicate polling without blocking the event loop.
 *
 * @param delayMs - Number of milliseconds to wait.
 * @returns A promise that resolves after the delay.
 */
function waitForOutcome(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

/**
 * Creates the Customer-scoped Conversation service used by the Commerce Agent.
 *
 * The returned module owns turn creation, idempotency, access checks, context
 * persistence, recommendation memory, completion, and privacy-safe storage.
 *
 * @param userId - Authenticated Customer who may access the Conversation.
 * @param repository - Persistence adapter; defaults to the PostgreSQL-backed
 * repository and may be replaced in tests.
 * @returns A Conversation module bound to the Customer.
 */
export function createConversationModule(
  userId: string,
  repository: ConversationRepository = postgresConversationRepository,
): ConversationModule {
  const owner = { userId };
  return {
    /**
     * Starts a new Agent turn or restores the result of a duplicate request.
     *
     * For a continuing Conversation, ownership is verified before the redacted
     * USER message is appended. For a first turn, an open Conversation is
     * created or reused. The returned turn object exposes the persistence steps
     * used while the Agent processes the request.
     *
     * @param input - Customer message, optional Conversation ID, and required
     * idempotency key for the turn.
     * @returns A new in-progress turn, or a no-op turn containing the previously
     * completed outcome when the request is a duplicate.
     * @throws {ConversationAccessError} When the requested Conversation is
     * missing, closed, or owned by another Customer.
     */
    async startTurn(input) {
      const duplicateOutcome = await repository.findDuplicate(
        owner,
        input.conversationId,
        input.idempotencyKey,
      );
      if (duplicateOutcome) {
        return duplicateAgentTurn(duplicateOutcome);
      }
      let conversationId: string;
      let userMessageId: string;
      let context: ConversationContext;
      if (input.conversationId) {
        const persisted = await repository.findOwnedContext(
          input.conversationId,
        );
        if (!persisted || persisted.userId !== userId)
          throw new ConversationAccessError();
        conversationId = input.conversationId;
        context = parseConversationContext(persisted.context);
        try {
          userMessageId = await repository.append(
            conversationId,
            "USER",
            redactSensitiveText(input.message),
            {},
            input.idempotencyKey,
          );
        } catch (error) {
          const duplicate = await repository.findDuplicate(
            owner,
            conversationId,
            input.idempotencyKey,
          );
          if (duplicate) return duplicateAgentTurn(duplicate);
          throw error;
        }
      } else {
        try {
          ({ conversationId, userMessageId, context } = await repository.create(
            owner,
            redactSensitiveText(input.message),
            input.idempotencyKey,
          ));
        } catch (error) {
          const duplicate = await repository.findDuplicate(
            owner,
            undefined,
            input.idempotencyKey,
          );
          if (duplicate) return duplicateAgentTurn(duplicate);
          throw error;
        }
        context = parseConversationContext(context);
      }
      return {
        conversationId,
        context,
        /**
         * Reloads the latest persisted context after a concurrent update.
         *
         * @returns The parsed, current Conversation Context.
         * @throws {ConversationAccessError} When the Conversation is no longer
         * available to this Customer.
         */
        async reloadContext() {
          const persisted = await repository.findOwnedContext(conversationId);
          if (!persisted || persisted.userId !== userId) {
            throw new ConversationAccessError();
          }
          return parseConversationContext(persisted.context);
        },
        /**
         * Persists the minimized Intent Brief together with the next context.
         *
         * @param intentBrief - Agent interpretation of the Customer's request.
         * @param nextContext - Context produced by applying that interpretation.
         * @returns The repository result, including `false` when optimistic
         * concurrency rejects a stale context update.
         */
        async recordIntentBrief(intentBrief, nextContext) {
          return repository.saveContextAndMetadata(
            conversationId,
            nextContext,
            userMessageId,
            sanitizeRecord({
              intentBrief: minimizeIntentBrief(intentBrief),
            }),
          );
        },
        /**
         * Remembers up to eight compact Product references for follow-up turns.
         *
         * Long display fields are bounded before persistence. If the repository
         * does not support recommendation memory, this operation is a no-op.
         *
         * @param products - Products recommended during the current turn.
         * @param expectedContext - Context revision used to create the
         * recommendations.
         * @returns A promise that resolves after the save attempt.
         */
        async recordRecommendationSet(products, expectedContext) {
          if (!repository.saveRecommendationSet) return;
          await repository.saveRecommendationSet(
            conversationId,
            expectedContext.revision,
            products.slice(0, 8).map((product) => ({
              productId: product.id,
              name: product.name.slice(0, 160),
              description: (product.description || product.name).slice(0, 160),
              category: product.category.slice(0, 160),
            })),
          );
        },
        /**
         * Completes the turn and persists a privacy-safe ASSISTANT transcript.
         *
         * Repositories with `finalizeTurn` persist the response and outcome
         * atomically. Simpler adapters fall back to appending a canonical,
         * minimized message and outcome metadata.
         *
         * @param message - Human-readable ASSISTANT response.
         * @param outcome - Typed result of Agent processing.
         * @returns A promise that resolves when completion is persisted.
         */
        async complete(message, outcome) {
          if (repository.finalizeTurn) {
            await repository.finalizeTurn(
              conversationId,
              userMessageId,
              message,
              outcome,
            );
            return;
          }
          await repository.append(
            conversationId,
            "ASSISTANT",
            outcome
              ? canonicalPersistedMessage(outcome)
              : redactSensitiveText(message),
            outcome ? outcomeMetadata(outcome) : {},
          );
        },
      };
    },
  };
}

/**
 * Creates a completed no-op turn for an idempotent replay.
 *
 * Persistence callbacks intentionally do nothing because the original request
 * already recorded the turn.
 *
 * @param duplicateOutcome - Previously persisted outcome to return to the
 * caller.
 * @returns A turn-shaped object containing the original outcome.
 */
function duplicateAgentTurn(duplicateOutcome: AgentOutcome) {
  return {
    conversationId: duplicateOutcome.conversationId ?? "",
    duplicateOutcome,
    /** Skips Intent persistence because the original turn already saved it. */
    async recordIntentBrief() {},
    /** Skips completion because the original turn is already complete. */
    async complete() {},
  };
}

/**
 * Reduces an Intent Brief to the bounded, non-sensitive facts needed for
 * diagnostics and subsequent processing.
 *
 * @param intentBrief - Full Intent Brief produced for the current turn.
 * @returns A copy with a canonical goal, removed free-form attributes, and
 * generalized missing-information details.
 */
function minimizeIntentBrief(intentBrief: IntentBrief): IntentBrief {
  return {
    ...intentBrief,
    goal: intentBrief.requestedEffects.includes("ADD_TO_CART")
      ? "Change Cart"
      : "Discover Products",
    constraints: {
      ...intentBrief.constraints,
      attributes: {},
    },
    missingInformation:
      intentBrief.missingInformation.length > 0
        ? ["ADDITIONAL_PRODUCT_PREFERENCE"]
        : [],
  };
}

/**
 * Maps an Agent outcome to the canonical message allowed in the durable
 * transcript.
 *
 * @param outcome - Typed outcome whose status determines the message.
 * @returns A short, non-sensitive summary of the result.
 */
function canonicalPersistedMessage(outcome: AgentOutcome): string {
  switch (outcome.status) {
    case "COMPLETED":
      return "Product discovery completed.";
    case "NEEDS_INPUT":
      return "Additional Product information requested.";
    case "TEMPORARILY_UNAVAILABLE":
      return "Commerce Agent temporarily unavailable.";
  }
}

/**
 * Builds inspectable, privacy-safe metadata for a completed Agent turn.
 *
 * Product results are retained, while response text and Intent details are
 * canonicalized, minimized, and recursively sanitized.
 *
 * @param outcome - Full Agent outcome returned to the Customer.
 * @returns JSON metadata suitable for durable message persistence.
 */
function outcomeMetadata(outcome: AgentOutcome): JsonObject {
  const { products, ...rest } = outcome;
  const minimized = sanitizeRecord({
    ...rest,
    message: canonicalPersistedMessage(outcome),
    ...(outcome.intentBrief
      ? { intentBrief: minimizeIntentBrief(outcome.intentBrief) }
      : {}),
    ...(outcome.status === "NEEDS_INPUT"
      ? {
          question: "What additional Product preference should I use?",
          missingInformation: ["ADDITIONAL_PRODUCT_PREFERENCE"],
        }
      : {}),
  });
  return { agentOutcome: { ...minimized, products } };
}

const privateTraceKeys = new Set([
  "chainofthought",
  "credentials",
  "address",
  "contact",
  "customername",
  "email",
  "fullname",
  "homeaddress",
  "password",
  "personaldata",
  "phone",
  "recipientname",
  "reasoning",
]);

/**
 * Recursively sanitizes a JSON object while preserving its object type.
 *
 * @param record - Metadata object to sanitize.
 * @returns A deep-sanitized JSON object.
 */
function sanitizeRecord(record: JsonObject): JsonObject {
  return sanitizeValue(record) as JsonObject;
}

/**
 * Recursively redacts sensitive strings and removes private trace fields from
 * an arbitrary value.
 *
 * @param value - Value to sanitize before durable persistence.
 * @returns A sanitized copy; primitive non-string values are returned as-is.
 */
function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") return redactSensitiveText(value);
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (typeof value !== "object" || value === null) return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key]) =>
          !privateTraceKeys.has(key.replaceAll(/[_-]/g, "").toLowerCase()),
      )
      .map(([key, item]) => [key, sanitizeValue(item)]),
  );
}

/**
 * Replaces common personal, payment, credential, address, and private-reasoning
 * patterns with stable redaction markers.
 *
 * @param value - Free-form text that may contain sensitive information.
 * @returns Text safe for durable Conversation persistence.
 */
function redactSensitiveText(value: string): string {
  return value
    .replace(
      /\b(?:private\s+)?(?:chain[- ]of[- ]thought|reasoning)\s*[:=]\s*[^;.!?]+/gi,
      "[REDACTED_PRIVATE_TRACE]",
    )
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[REDACTED_EMAIL]")
    .replace(/\b[\w.-]{2,}@[A-Za-z][A-Za-z0-9]{1,}\b/g, "[REDACTED_PAYMENT_ID]")
    .replace(
      /\b(?:(?:\d{4}[ -]){3}\d{4}|\d{4}[ -]\d{6}[ -]\d{5}|\d{13,19})\b/g,
      "[REDACTED_PAYMENT_CARD]",
    )
    .replace(
      /\b(?:cvv|cvc|card\s+security\s+code)\b\s*(?::|=|is)?\s*\d{3,4}\b/gi,
      "[REDACTED_CARD_SECURITY_CODE]",
    )
    .replace(
      /\b(?:exp(?:iry|iration)?(?:\s+date)?)\b\s*(?::|=|is)?\s*(?:0?[1-9]|1[0-2])\s*[/-]\s*\d{2,4}\b/gi,
      "[REDACTED_CARD_EXPIRY]",
    )
    .replace(
      /\b(?:phone|mobile|tel(?:ephone)?)\b\s*(?::|=|is)?\s*\+?[\d(). -]{7,24}\d\b/gi,
      "[REDACTED_PHONE]",
    )
    .replace(
      /(?<![\w-])\+?\d{1,3}[ .-]?(?:\(?\d{2,5}\)?[ .-]){1,3}\d{3,5}(?![\w-])/g,
      "[REDACTED_PHONE]",
    )
    .replace(
      /\b(?:(?:flat|apartment|apt|unit|house)\s+[A-Za-z0-9-]+\s*,?\s*)?\d{1,6}\s+(?:[A-Za-z0-9.'-]+\s+){1,6}(?:street|st|road|rd|avenue|ave|lane|ln|drive|dr|boulevard|blvd|way|court|ct)\b/gi,
      "[REDACTED_ADDRESS]",
    )
    .replace(
      /\b(?:pin|postal|zip)(?:\s+code)?\b\s*(?::|=|is)?\s*[A-Za-z0-9 -]{3,12}\b/gi,
      "[REDACTED_POSTAL_CODE]",
    )
    .replace(
      /\b(for|recipient|named)\s+[A-Z][a-z]{1,30}\b/g,
      "$1 [REDACTED_PERSON]",
    )
    .replace(
      /\b(?:otp|password|passcode|api[\s_-]?key|access[\s_-]?token|refresh[\s_-]?token|token|secret)\b\s*(?::|=|is)?\s*[^\s,;.!?]+/gi,
      "[REDACTED_CREDENTIAL]",
    )
    .replace(/(?<![-\d])\d{10,19}(?![-\d])/g, "[REDACTED_NUMBER]");
}
