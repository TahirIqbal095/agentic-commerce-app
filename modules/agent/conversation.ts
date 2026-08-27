import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema/agent";
import type { ConversationModule } from "./commerce-agent";

type ConversationOwner = { userId: string; merchantId: string };
export interface ConversationRepository {
  create(owner: ConversationOwner, userMessage: string): Promise<string>;
  findOwner(conversationId: string): Promise<ConversationOwner | null>;
  append(conversationId: string, role: "USER" | "ASSISTANT", content: string): Promise<void>;
}

export class ConversationAccessError extends Error {
  constructor() { super("The conversation was not found."); this.name = "ConversationAccessError"; }
}

const postgresConversationRepository: ConversationRepository = {
  async create(owner, userMessage) {
    return db.transaction(async (transaction) => {
      const [conversation] = await transaction.insert(conversations).values(owner).returning({ id: conversations.id });
      await transaction.insert(messages).values({ conversationId: conversation.id, role: "USER", content: userMessage });
      return conversation.id;
    });
  },
  async findOwner(conversationId) {
    const [owner] = await db.select({ userId: conversations.userId, merchantId: conversations.merchantId }).from(conversations).where(eq(conversations.id, conversationId)).limit(1);
    return owner ?? null;
  },
  async append(conversationId, role, content) {
    await db.transaction(async (transaction) => {
      await transaction.insert(messages).values({ conversationId, role, content });
      await transaction.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversationId));
    });
  },
};

export function createConversationModule(userId: string, merchantId: string, repository: ConversationRepository = postgresConversationRepository): ConversationModule {
  const owner = { userId, merchantId };
  return {
    async startTurn(input) {
      let conversationId: string;
      if (input.conversationId) {
        const persistedOwner = await repository.findOwner(input.conversationId);
        if (!persistedOwner || persistedOwner.userId !== userId || persistedOwner.merchantId !== merchantId) throw new ConversationAccessError();
        conversationId = input.conversationId;
        await repository.append(conversationId, "USER", input.message);
      } else {
        conversationId = await repository.create(owner, input.message);
      }
      return { conversationId, async complete(message) { await repository.append(conversationId, "ASSISTANT", message); } };
    },
  };
}
