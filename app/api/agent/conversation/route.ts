import { db } from "@/db";
import { createConversationState } from "@/modules/agent/conversation-state";
import { createDatabaseGuestSessionStore } from "@/modules/identity/guest-session";
import { createConversationRoutes } from "./route-factory";

const routes = createConversationRoutes({
  store: createDatabaseGuestSessionStore(db),
  createState: (guestSession) => createConversationState(guestSession.id),
});

export const GET = routes.GET;
export const DELETE = routes.DELETE;
