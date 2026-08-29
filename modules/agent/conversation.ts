import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema/agent";
import type { JsonObject } from "@/db/schema/types";
import type { ConversationModule } from "./commerce-agent";
import {
  createEmptyConversationContext,
  parseConversationContext,
} from "./conversation-context";
import type {
  AgentOutcome,
  ConversationContext,
  IntentBrief,
} from "./types";

type ConversationOwner = { userId: string };
export interface ConversationRepository {
  create(
    owner: ConversationOwner,
    userMessage: string,
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
  ): Promise<void>;
  append(
    conversationId: string,
    role: "USER" | "ASSISTANT",
    content: string,
    metadata?: JsonObject,
  ): Promise<string>;
}

export class ConversationAccessError extends Error {
  constructor() {
    super("The conversation was not found.");
    this.name = "ConversationAccessError";
  }
}

const postgresConversationRepository: ConversationRepository = {
  async create(owner, userMessage) {
    return db.transaction(async (transaction) => {
      const context = createEmptyConversationContext();
      const [conversation] = await transaction
        .insert(conversations)
        .values({ ...owner, context })
        .returning({ id: conversations.id });
      const [message] = await transaction
        .insert(messages)
        .values({
          conversationId: conversation.id,
          role: "USER",
          content: userMessage,
        })
        .returning({ id: messages.id });
      return {
        conversationId: conversation.id,
        userMessageId: message.id,
        context,
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
      .where(eq(conversations.id, conversationId))
      .limit(1);
    return ownedContext
      ? { ...ownedContext, context: parseConversationContext(ownedContext.context) }
      : null;
  },
  async saveContextAndMetadata(conversationId, context, messageId, metadata) {
    await db.transaction(async (transaction) => {
      await transaction
        .update(conversations)
        .set({ context, updatedAt: new Date() })
        .where(eq(conversations.id, conversationId));
      await transaction
        .update(messages)
        .set({ metadata })
        .where(eq(messages.id, messageId));
    });
  },
  async append(conversationId, role, content, metadata = {}) {
    return db.transaction(async (transaction) => {
      const [message] = await transaction
        .insert(messages)
        .values({ conversationId, role, content, metadata })
        .returning({ id: messages.id });
      await transaction
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, conversationId));
      return message.id;
    });
  },
};

export function createConversationModule(
  userId: string,
  repository: ConversationRepository = postgresConversationRepository,
): ConversationModule {
  const owner = { userId };
  return {
    async startTurn(input) {
      let conversationId: string;
      let userMessageId: string;
      let context: ConversationContext;
      if (input.conversationId) {
        const persisted = await repository.findOwnedContext(input.conversationId);
        if (!persisted || persisted.userId !== userId)
          throw new ConversationAccessError();
        conversationId = input.conversationId;
        context = parseConversationContext(persisted.context);
        userMessageId = await repository.append(
          conversationId,
          "USER",
          input.message,
        );
      } else {
        ({ conversationId, userMessageId, context } = await repository.create(
          owner,
          input.message,
        ));
        context = parseConversationContext(context);
      }
      return {
        conversationId,
        context,
        async recordIntentBrief(intentBrief, nextContext) {
          await repository.saveContextAndMetadata(
            conversationId,
            nextContext,
            userMessageId,
            sanitizeRecord({
              intentBrief: minimizeIntentBrief(intentBrief),
            }),
          );
        },
        async complete(message, outcome) {
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
    .replace(
      /\b\d{1,6}\s+(?:[A-Za-z0-9.'-]+\s+){1,6}(?:street|st|road|rd|avenue|ave|lane|ln|drive|dr|boulevard|blvd|way|court|ct)\b/gi,
      "[REDACTED_ADDRESS]",
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
