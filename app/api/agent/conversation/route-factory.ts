import type { ConversationState } from "@/modules/agent/conversation-state";
import { dataResponse } from "@/lib/http/responses";
import {
  createGuestSessionBrowsingRoute,
  createGuestSessionRoute,
  type GuestSession,
  type GuestSessionStore,
} from "@/modules/identity/guest-session";
import { createConversationHandler } from "./handler";

type ConversationRouteOptions = {
  store: GuestSessionStore;
  createState: (guestSession: GuestSession) => ConversationState;
  issueToken?: () => string;
  now?: () => Date;
};

export function createConversationRoutes(options: ConversationRouteOptions) {
  const guestSessionOptions = {
    store: options.store,
    ...(options.issueToken ? { issueToken: options.issueToken } : {}),
    ...(options.now ? { now: options.now } : {}),
  };
  return {
    GET: createGuestSessionBrowsingRoute(
      (_request, guestSession) =>
        guestSession
          ? createConversationHandler(options.createState(guestSession)).GET()
          : Promise.resolve(dataResponse(null)),
      guestSessionOptions,
    ),
    DELETE: createGuestSessionRoute(
      (_request, guestSession) =>
        createConversationHandler(options.createState(guestSession)).DELETE(),
      guestSessionOptions,
    ),
  };
}
