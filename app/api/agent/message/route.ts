import {
  dataResponse,
  errorResponse,
  unexpectedErrorResponse,
} from "@/lib/http/responses";
import {
  createCommerceAgent,
  type CommerceAgent,
} from "@/modules/agent/commerce-agent";
import { createAiIntentInterpreter } from "@/modules/agent/ai-intent-interpreter";
import { createCatalogModule } from "@/modules/catalog/catalog";
import { resolveMerchantContext } from "@/modules/identity/merchant-context";

type AgentFactory = () => Promise<CommerceAgent>;

async function createAgentForCurrentMerchant(): Promise<CommerceAgent> {
  const { merchantId } = await resolveMerchantContext();
  return createCommerceAgent(
    createCatalogModule(merchantId),
    createAiIntentInterpreter(),
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

    try {
      const agent = await createAgent();
      return dataResponse(
        await agent.respond({ message: body.message.trim() }),
      );
    } catch (error) {
      console.error("Agent response failed", error);
      return unexpectedErrorResponse();
    }
  };
}

export const POST = createPostHandler(createAgentForCurrentMerchant);
