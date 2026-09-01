import assert from "node:assert/strict";
import test from "node:test";
import { createConversationHandler } from "./handler";
import type { CurrentConversation } from "@/modules/agent/conversation-state";
import { createEmptyConversationContext } from "@/modules/agent/intent";
import { createConversationRoutes } from "./route-factory";
import type {
  GuestSession,
  GuestSessionStore,
} from "@/modules/identity/guest-session";
import { createGuestSessionRoute } from "@/modules/identity/guest-session";

test("returning with the same valid cookie resumes the current Conversation", async () => {
  const sessionsByTokenHash = new Map<string, GuestSession>();
  const snapshotBySessionId = new Map([
    [
      "guest-session-1",
      {
        conversationId: "41000000-0000-4000-8000-000000000001",
        transcript: [],
        contextSummary: createEmptyConversationContext().productConstraints,
        revision: 0,
      },
    ],
  ]);
  const store: GuestSessionStore = {
    async findActive(tokenHash) {
      return sessionsByTokenHash.get(tokenHash) ?? null;
    },
    async create({ tokenHash }) {
      const session = { id: "guest-session-1" };
      sessionsByTokenHash.set(tokenHash, session);
      return session;
    },
    async refresh() {},
  };
  const routes = createConversationRoutes({
    store,
    issueToken: () => "returning-browser-token",
    createState(guestSession) {
      return {
        async loadCurrent() {
          return guestSession
            ? (snapshotBySessionId.get(guestSession.id) ?? null)
            : null;
        },
        async resetCurrent() {},
      };
    },
  });
  const statefulResponse = await routes.DELETE(
    new Request("https://storefront.example/api/agent/conversation", {
      method: "DELETE",
    }),
  );
  const setCookie = statefulResponse.headers.get("set-cookie");
  assert.ok(setCookie);

  const response = await routes.GET(
    new Request("https://storefront.example/api/agent/conversation", {
      headers: { cookie: setCookie.split(";", 1)[0] },
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    data: snapshotBySessionId.get("guest-session-1"),
  });
});

test("starting a new Conversation removes previous access without changing the Cart", async () => {
  const sessionsByTokenHash = new Map<string, GuestSession>();
  let currentConversation: CurrentConversation | null = {
    conversationId: "41000000-0000-4000-8000-000000000001",
    transcript: [],
    contextSummary: createEmptyConversationContext().productConstraints,
    revision: 1,
  };
  const cartQuantity = 2;
  const store: GuestSessionStore = {
    async findActive(tokenHash) {
      return sessionsByTokenHash.get(tokenHash) ?? null;
    },
    async create({ tokenHash }) {
      const session = { id: "guest-session-1" };
      sessionsByTokenHash.set(tokenHash, session);
      return session;
    },
    async refresh() {},
  };
  const createSession = createGuestSessionRoute(
    async () => new Response(null, { status: 204 }),
    { store, issueToken: () => "conversation-lifecycle-token" },
  );
  const sessionResponse = await createSession(
    new Request("https://storefront.example/api/stateful", { method: "POST" }),
  );
  const cookie = sessionResponse.headers.get("set-cookie")!.split(";", 1)[0];
  const routes = createConversationRoutes({
    store,
    createState() {
      return {
        async loadCurrent() {
          return currentConversation;
        },
        async resetCurrent() {
          currentConversation = null;
        },
      };
    },
  });

  const reset = await routes.DELETE(
    new Request("https://storefront.example/api/agent/conversation", {
      method: "DELETE",
      headers: { cookie },
    }),
  );
  const reloaded = await routes.GET(
    new Request("https://storefront.example/api/agent/conversation", {
      headers: { cookie },
    }),
  );

  assert.equal(reset.status, 200);
  assert.deepEqual(await reloaded.json(), { data: null });
  assert.equal(cartQuantity, 2);
});

test("loads the Customer's current Conversation Transcript and Context Summary", async () => {
  const context = {
    ...createEmptyConversationContext(),
    revision: 2,
    productConstraints: {
      ...createEmptyConversationContext().productConstraints,
      productTypes: ["shoes"],
      maxPriceMinor: 400000,
    },
  };
  const snapshot = {
    conversationId: "41000000-0000-4000-8000-000000000001",
    transcript: [
      {
        id: "51000000-0000-4000-8000-000000000001",
        customerMessage: "I want shoes under 4000",
        result: null,
        error: null,
      },
    ],
    contextSummary: context.productConstraints,
    revision: 2,
  };
  const handler = createConversationHandler({
    async loadCurrent() {
      return snapshot;
    },
    async resetCurrent() {},
  });

  const response = await handler.GET();

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { data: snapshot });
});

test("removes the current Conversation from Customer access", async () => {
  let resets = 0;
  const handler = createConversationHandler({
    async loadCurrent() {
      return null;
    },
    async resetCurrent() {
      resets += 1;
    },
  });

  const response = await handler.DELETE();

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { data: { reset: true } });
  assert.equal(resets, 1);
});
