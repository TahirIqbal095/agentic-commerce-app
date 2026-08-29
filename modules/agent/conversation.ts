import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema/agent";
import type { JsonObject } from "@/db/schema/types";
import type { ConversationModule } from "./commerce-agent";
import type { AgentOutcome, IntentBrief } from "./types";

type ConversationOwner = { userId: string };
export interface ConversationRepository {
  create(
    owner: ConversationOwner,
    userMessage: string,
  ): Promise<{ conversationId: string; userMessageId: string }>;
  findOwner(conversationId: string): Promise<ConversationOwner | null>;
  updateMetadata(messageId: string, metadata: JsonObject): Promise<void>;
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
      const [conversation] = await transaction
        .insert(conversations)
        .values(owner)
        .returning({ id: conversations.id });
      const [message] = await transaction
        .insert(messages)
        .values({
          conversationId: conversation.id,
          role: "USER",
          content: userMessage,
        })
        .returning({ id: messages.id });
      return { conversationId: conversation.id, userMessageId: message.id };
    });
  },
  async findOwner(conversationId) {
    const [owner] = await db
      .select({
        userId: conversations.userId,
      })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    return owner ?? null;
  },
  async updateMetadata(messageId, metadata) {
    await db
      .update(messages)
      .set({ metadata })
      .where(eq(messages.id, messageId));
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
      if (input.conversationId) {
        const persistedOwner = await repository.findOwner(input.conversationId);
        if (!persistedOwner || persistedOwner.userId !== userId)
          throw new ConversationAccessError();
        conversationId = input.conversationId;
        userMessageId = await repository.append(
          conversationId,
          "USER",
          input.message,
        );
      } else {
        ({ conversationId, userMessageId } = await repository.create(
          owner,
          input.message,
        ));
      }
      return {
        conversationId,
        async recordIntentBrief(intentBrief) {
          await repository.updateMetadata(
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
