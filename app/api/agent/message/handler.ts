import {
  dataResponse,
  errorResponse,
  unexpectedErrorResponse,
} from "@/lib/http/responses";
import type { CommerceAgent } from "@/modules/agent/commerce-agent";
import { ConversationAccessError } from "@/modules/agent/conversation";
import { isUuid } from "@/lib/validation";

type AgentFactory = () => Promise<CommerceAgent>;

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
        await agent.respond({
          ...(conversationId ? { conversationId } : {}),
          message: body.message.trim(),
        }),
      );
    } catch (error) {
      if (error instanceof ConversationAccessError) {
        return errorResponse(
          {
            code: "CONVERSATION_NOT_FOUND",
            message: error.message,
            details: {},
          },
          404,
        );
      }
      console.error("Agent response failed", error);
      return unexpectedErrorResponse();
    }
  };
}
