import type { CatalogProduct } from "@/modules/catalog/types";
import type { DbExecutor } from "@/db";
import type { AgentOutcome } from "./agent-outcome";
import {
  canonicalPersistedMessage,
  minimizeIntentBrief,
  outcomeMetadata,
  redactSensitiveText,
  sanitizeRecord,
} from "./conversation-privacy";
import {
  postgresConversationRepository,
  type ConversationRepository,
} from "./conversation-repository";
import {
  parseConversationContext,
  type ConversationContext,
  type IntentBrief,
} from "./intent";

export type AgentMessage = {
  conversationId?: string;
  idempotencyKey: string;
  message: string;
};

export type AgentTurn = {
  conversationId: string;
  idempotencyKey?: string;
  duplicateOutcome?: AgentOutcome;
  /** Persists a bounded Recommendation Set for use by later turns. */
  recordRecommendationSet?(
    products: CatalogProduct[],
    context: ConversationContext,
  ): Promise<boolean | void>;
  context?: ConversationContext;
  /** Persists the resolved Intent Brief and next Conversation Context. */
  recordIntentBrief(
    intentBrief: IntentBrief,
    context: ConversationContext,
  ): Promise<boolean | void>;
  /** Reloads Conversation Context after an optimistic-concurrency conflict. */
  reloadContext?(): Promise<ConversationContext>;
  /** Persists the completed ASSISTANT response and typed outcome. */
  complete(
    assistantMessage: string,
    outcome: AgentOutcome,
    executor?: DbExecutor,
  ): Promise<void>;
};

export interface ConversationModule {
  /** Starts a new Conversation Turn or restores an idempotent replay. */
  startTurn(input: AgentMessage): Promise<AgentTurn>;
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

/**
 * Creates the Customer-scoped Conversation module used by the Commerce Agent.
 *
 * The returned module owns turn creation, idempotency, access checks, context
 * persistence, recommendation memory, completion, and privacy-safe storage.
 *
 * @param guestSessionId - Browser-scoped Guest Session that owns the Conversation.
 * @param repository - Persistence adapter; defaults to PostgreSQL and may be
 * replaced by an in-memory adapter in tests.
 * @returns A Conversation module bound to the Customer.
 */
export function createConversationModule(
  guestSessionId: string,
  repository: ConversationRepository = postgresConversationRepository,
): ConversationModule {
  const owner = { guestSessionId };
  return {
    /**
     * Starts a new Agent turn or restores the result of a duplicate request.
     *
     * For a continuing Conversation, ownership is verified before the redacted
     * Customer message is appended. For a first turn, an open Conversation is
     * created or reused. The returned turn exposes the persistence operations
     * used while the Commerce Agent processes the Customer message.
     *
     * @param input - Customer message, optional Conversation ID, and required
     * idempotency key.
     * @returns A new in-progress turn, or a no-op turn containing the previous
     * outcome when the request is a duplicate.
     * @throws {ConversationAccessError} When the Conversation is unavailable to
     * the current Guest Session.
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
      let customerMessageId: string;
      let context: ConversationContext;
      if (input.conversationId) {
        const persisted = await repository.findOwnedContext(
          input.conversationId,
        );
        if (
          !persisted ||
          persisted.guestSessionId !== guestSessionId
        ) {
          throw new ConversationAccessError();
        }
        conversationId = input.conversationId;
        context = parseConversationContext(persisted.context);
        try {
          customerMessageId = await repository.append(
            conversationId,
            "CUSTOMER",
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
          ({ conversationId, customerMessageId, context } = await repository.create(
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
        idempotencyKey: input.idempotencyKey,
        context,
        /**
         * Reloads the latest persisted context after a concurrent update.
         *
         * @returns The parsed current Conversation Context.
         * @throws {ConversationAccessError} When the Conversation is no longer
         * available to this Customer.
         */
        async reloadContext() {
          const persisted = await repository.findOwnedContext(conversationId);
          if (
            !persisted ||
            persisted.guestSessionId !== guestSessionId
          ) {
            throw new ConversationAccessError();
          }
          return parseConversationContext(persisted.context);
        },
        /**
         * Persists a minimized, sanitized Intent Brief with the next context.
         *
         * @param intentBrief - Commerce Agent interpretation of the request.
         * @param nextContext - Context produced from that interpretation.
         * @returns The repository result, including `false` when optimistic
         * concurrency rejects a stale context update.
         */
        async recordIntentBrief(intentBrief, nextContext) {
          return repository.saveContextAndMetadata(
            conversationId,
            nextContext,
            customerMessageId,
            sanitizeRecord({
              intentBrief: minimizeIntentBrief(intentBrief),
            }),
          );
        },
        /**
         * Remembers up to eight compact Product references for follow-up turns.
         *
         * @param products - Products recommended during this turn.
         * @param expectedContext - Context revision used for recommendations.
         * @returns A promise that resolves after the save attempt.
         */
        async recordRecommendationSet(products, expectedContext) {
          if (!repository.saveRecommendationSet) return;
          return repository.saveRecommendationSet(
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
         * Completes the turn with a privacy-safe ASSISTANT Transcript entry.
         *
         * Repositories with `finalizeTurn` persist the message and outcome
         * atomically. Simpler adapters append canonical outcome metadata.
         *
         * @param message - Human-readable ASSISTANT response.
         * @param outcome - Typed result of Commerce Agent processing.
         * @returns A promise that resolves when completion is persisted.
         */
        async complete(message, outcome, executor) {
          if (repository.finalizeTurn) {
            await repository.finalizeTurn(
              conversationId,
              customerMessageId,
              message,
              outcome,
              executor,
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
 * @param duplicateOutcome - Previously persisted outcome returned to the
 * caller.
 * @returns A turn-shaped object whose persistence methods intentionally do
 * nothing because the original turn is already complete.
 */
function duplicateAgentTurn(duplicateOutcome: AgentOutcome): AgentTurn {
  return {
    conversationId: duplicateOutcome.conversationId ?? "",
    duplicateOutcome,
    /** Skips Intent persistence because the original turn already saved it. */
    async recordIntentBrief() {},
    /** Skips completion because the original turn is already complete. */
    async complete() {},
  };
}
