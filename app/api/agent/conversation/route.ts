import { resolveUserContext } from "@/modules/identity/user-context";
import { createConversationState } from "@/modules/agent/conversation-state";
import { createConversationHandler } from "./handler";

async function stateForCustomer() {
  const { userId } = await resolveUserContext();
  return createConversationState(userId);
}

export async function GET(): Promise<Response> {
  const state = await stateForCustomer();
  return createConversationHandler(state).GET();
}

export async function DELETE(): Promise<Response> {
  const state = await stateForCustomer();
  return createConversationHandler(state).DELETE();
}
