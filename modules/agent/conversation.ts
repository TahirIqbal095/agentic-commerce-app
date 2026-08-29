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
  findDuplicate(
    owner: ConversationOwner,
    conversationId: string | undefined,
    idempotencyKey: string,
  ): Promise<AgentOutcome | null>;
  create(
    owner: ConversationOwner,
    userMessage: string,
    idempotencyKey: string,
  ): Promise<{
    conversationId: string;
    userMessageId: string;
    context: ConversationContext;
  }>;
  findOwnedContext(
    conversationId: string,
  ): Promise<(ConversationOwner & { context: ConversationContext }) | null>;
  saveContextAndMetadata(
    conversationId: string,
    context: ConversationContext,
    messageId: string,
    metadata: JsonObject,
  ): Promise<boolean | void>;
  append(
    conversationId: string,
    role: "USER" | "ASSISTANT",
    content: string,
    metadata?: JsonObject,
    idempotencyKey?: string,
  ): Promise<string>;
  finalizeTurn?(
    conversationId: string,
    userMessageId: string,
    content: string,
    outcome: AgentOutcome,
  ): Promise<void>;
  saveRecommendationSet?(
    conversationId: string,
    expectedRevision: number,
    recommendations: RecommendationReference[],
  ): Promise<boolean>;
}

export class ConversationAccessError extends Error {
  constructor() {
    super("The conversation was not found.");
    this.name = "ConversationAccessError";
  }
}

const postgresConversationRepository: ConversationRepository = {
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
  async findOwnedContext(conversationId) {
    const [ownedContext] = await db
      .select({
        userId: conversations.userId,
        context: conversations.context,
      })
      .from(conversations)
      .where(
        and(eq(conversations.id, conversationId), isNull(conversations.closedAt)),
      )
      .limit(1);
    return ownedContext
      ? { ...ownedContext, context: parseConversationContext(ownedContext.context) }
      : null;
  },
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
      .set({ context: { ...context, latestRecommendationSet: recommendations } })
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

function waitForOutcome(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export function createConversationModule(
  userId: string,
  repository: ConversationRepository = postgresConversationRepository,
): ConversationModule {
  const owner = { userId };
  return {
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
        const persisted = await repository.findOwnedContext(input.conversationId);
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
        async reloadContext() {
          const persisted = await repository.findOwnedContext(conversationId);
          if (!persisted || persisted.userId !== userId) {
            throw new ConversationAccessError();
          }
          return parseConversationContext(persisted.context);
        },
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

function duplicateAgentTurn(duplicateOutcome: AgentOutcome) {
  return {
    conversationId: duplicateOutcome.conversationId ?? "",
    duplicateOutcome,
    async recordIntentBrief() {},
    async complete() {},
  };
}

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

function sanitizeRecord(record: JsonObject): JsonObject {
  return sanitizeValue(record) as JsonObject;
}

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
