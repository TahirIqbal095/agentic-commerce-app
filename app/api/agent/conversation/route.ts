import { resolveUserContext } from "@/modules/identity/user-context";
import { createConversationState } from "@/modules/agent/conversation-state";
import { createConversationHandler } from "./handler";
import {
  createStorefrontBrowsingRoute,
  createStorefrontGuestSessionRoute,
} from "@/modules/identity/guest-session";

async function stateForCustomer() {
  const { userId } = await resolveUserContext();
  return createConversationState(userId);
}

async function getConversation(): Promise<Response> {
  const state = await stateForCustomer();
  return createConversationHandler(state).GET();
}

export const GET = createStorefrontBrowsingRoute(() => getConversation());

async function deleteConversation(): Promise<Response> {
  const state = await stateForCustomer();
  return createConversationHandler(state).DELETE();
}

export const DELETE = createStorefrontGuestSessionRoute(() =>
  deleteConversation(),
);
