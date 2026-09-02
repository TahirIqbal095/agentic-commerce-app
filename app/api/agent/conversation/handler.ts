import { dataResponse, unexpectedErrorResponse } from "@/lib/http/responses";
import type { ConversationState } from "@/modules/agent/conversation-state";

/**
 * Creates the Conversation lifecycle handlers.
 *
 * The handlers depend on Conversation reading and reset alone, so a Customer
 * Action Entry can only be recorded through the deterministic Storefront
 * control that produces it.
 */
export function createConversationHandler(
  state: Pick<ConversationState, "loadCurrent" | "resetCurrent">,
) {
  return {
    async GET(): Promise<Response> {
      try {
        return dataResponse(await state.loadCurrent());
      } catch (error) {
        console.error("Current Conversation load failed", error);
        return unexpectedErrorResponse();
      }
    },
    async DELETE(): Promise<Response> {
      try {
        await state.resetCurrent();
        return dataResponse({ reset: true });
      } catch (error) {
        console.error("Conversation reset failed", error);
        return unexpectedErrorResponse();
      }
    },
  };
}
