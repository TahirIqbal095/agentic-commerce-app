import {
  dataResponse,
  errorResponse,
  unexpectedErrorResponse,
} from "@/lib/http/responses";
import {
  createCommerceAgent,
  type CommerceAgent,
} from "@/modules/agent/commerce-agent";
import { createAiIntentAnalyzer } from "@/modules/agent/ai-intent-interpreter";
import { createAiOutcomeComposer } from "@/modules/agent/ai-outcome-composer";
import { ConversationAccessError, createConversationModule } from "@/modules/agent/conversation";
import { createCatalogModule } from "@/modules/catalog/catalog";
import { resolveUserContext } from "@/modules/identity/user-context";
import { resolveMerchantContext } from "@/modules/identity/merchant-context";
import { isUuid } from "@/lib/validation";

type AgentFactory = () => Promise<CommerceAgent>;

async function createAgentForCurrentMerchant(): Promise<CommerceAgent> {
  const [{ merchantId }, { userId }] = await Promise.all([
    resolveMerchantContext(),
    resolveUserContext(),
  ]);
  return createCommerceAgent(
    createCatalogModule(merchantId),
    createAiIntentAnalyzer(),
    createConversationModule(userId, merchantId),
    { outcomeComposer: createAiOutcomeComposer() },
  );
}

export function createPostHandler(createAgent: AgentFactory) {
  return async function POST(request: Request): Promise<Response> {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse(
        {
          code: "INVALID_MESSAGE",
          message: "Request body must be valid JSON.",
          details: {},
        },
        400,
      );
    }

    if (
      typeof body !== "object" ||
      body === null ||
      !("message" in body) ||
      typeof body.message !== "string" ||
      body.message.trim().length === 0
    ) {
      return errorResponse(
        {
          code: "INVALID_MESSAGE",
          message: "message cannot be empty.",
          details: { field: "message" },
        },
        400,
      );
    }

    const conversationId =
      "conversationId" in body ? body.conversationId : undefined;
    if (
      conversationId !== undefined &&
      (typeof conversationId !== "string" || !isUuid(conversationId))
    ) {
      return errorResponse(
        {
          code: "INVALID_CONVERSATION_ID",
          message: "conversationId must be a UUID.",
          details: { field: "conversationId" },
        },
        400,
      );
    }

    try {
      const agent = await createAgent();
      return dataResponse(
        await agent.respond({ ...(conversationId ? { conversationId } : {}), message: body.message.trim() }),
      );
    } catch (error) {
      if (error instanceof ConversationAccessError) {
        return errorResponse({ code: "CONVERSATION_NOT_FOUND", message: error.message, details: {} }, 404);
      }
      console.error("Agent response failed", error);
      return unexpectedErrorResponse();
    }
  };
}

export const POST = createPostHandler(createAgentForCurrentMerchant);
