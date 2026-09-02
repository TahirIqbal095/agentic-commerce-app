import type { CommerceAgent } from "@/modules/agent/commerce-agent";
import {
  createGuestSessionRoute,
  type GuestSession,
  type GuestSessionStore,
} from "@/modules/identity/guest-session";
import { createPostHandler } from "./handler";

type MessageRouteOptions = {
  store: GuestSessionStore;
  createAgent: (guestSession: GuestSession) => Promise<CommerceAgent>;
  issueToken?: () => string;
};

export function createMessageRoute(options: MessageRouteOptions) {
  return createGuestSessionRoute(
    (request, guestSession) =>
      createPostHandler(() => options.createAgent(guestSession))(request),
    {
      store: options.store,
      ...(options.issueToken ? { issueToken: options.issueToken } : {}),
    },
  );
}
