import { dataResponse, unexpectedErrorResponse } from "@/lib/http/responses";
import type { ConversationState } from "@/modules/agent/conversation-state";

export function createConversationHandler(state: ConversationState) {
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
