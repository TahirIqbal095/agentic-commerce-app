import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createCommerceAgent } from "@/modules/agent/commerce-agent";
import type { CommerceAgentLoop } from "@/modules/agent/commerce-agent";
import type { AgentOutcome } from "@/modules/agent/agent-outcome";
import type { AgentTurn, ConversationModule } from "@/modules/agent/conversation";
import {
  createEmptyConversationContext,
  type IntentAnalysis,
  type IntentAnalyzer,
} from "@/modules/agent/intent";
import { createCartInspection } from "@/modules/cart/cart-inspection";
import type { CartView } from "@/modules/cart/cart";
import type { CatalogModule } from "@/modules/catalog/catalog";
import type { GuestSessionStore } from "@/modules/identity/guest-session";
import { createMessageRoute } from "./route-factory";

const IDEMPOTENCY_KEY = "41000000-0000-4000-8000-000000000001";

const OWNED_CART: CartView = {
  id: "31000000-0000-4000-8000-000000000001",
  version: 4,
  items: [
    {
      productId: "11000000-0000-4000-8000-000000000001",
      productName: "Quiet Buds",
      quantity: 2,
      cartPriceMinor: 349900,
      subtotalMinor: 699800,
    },
  ],
  totalQuantity: 2,
  subtotalMinor: 699800,
  currency: "INR",
};

const SOMEONE_ELSES_CART: CartView = {
  id: "31000000-0000-4000-8000-000000000002",
  version: 9,
  items: [
    {
      productId: "11000000-0000-4000-8000-000000000002",
      productName: "Trail Runner",
      quantity: 5,
      cartPriceMinor: 899900,
      subtotalMinor: 4499500,
    },
  ],
  totalQuantity: 5,
  subtotalMinor: 4499500,
  currency: "INR",
};

const EMPTY_CART: CartView = {
  id: null,
  version: 0,
  items: [],
  totalQuantity: 0,
  subtotalMinor: 0,
  currency: "INR",
};

const CARTS_BY_GUEST_SESSION = new Map<string, CartView>([
  ["guest-session-1", OWNED_CART],
  ["guest-session-2", SOMEONE_ELSES_CART],
]);

const unusedCatalog: CatalogModule = {
  async search() {
    throw new Error("Cart inspection must not search the Catalog.");
  },
  async getProduct() {
    throw new Error("Cart inspection must not read the Catalog.");
  },
};

const rejectingLoop: CommerceAgentLoop = {
  async run() {
    throw new Error("The Commerce Agent loop must not run for Cart inspection.");
  },
};

function analyzerRequesting(
  requestedEffects: IntentAnalysis["requestedEffects"],
): IntentAnalyzer {
  return {
    async analyze() {
      return {
        goal: "Understand the current Cart",
        constraintDelta: { set: {}, clear: [] },
        knownEntities: [],
        missingInformation: [],
        confidence: 0.9,
        requestedEffects,
      };
    },
  };
}

function conversationForTurn(conversationId: string): ConversationModule {
  return {
    async startTurn(): Promise<AgentTurn> {
      return {
        conversationId,
        context: createEmptyConversationContext(),
        async recordIntentBrief() {},
        async recordRecommendationSet() {},
        async complete() {},
      };
    },
  };
}

function guestSessionStore(sessions: Record<string, string>): GuestSessionStore {
  const byHash = new Map(
    Object.entries(sessions).map(([token, id]) => [
      createHash("sha256").update(token).digest("hex"),
      { id },
    ]),
  );
  return {
    async findActiveAndRefresh(tokenHash) {
      return byHash.get(tokenHash) ?? null;
    },
    async create() {
      return { id: "guest-session-3" };
    },
  };
}

function messageRequest(message: string, token: string): Request {
  return new Request("https://storefront.example/api/agent/message", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `guest_session=${token}`,
    },
    body: JSON.stringify({ idempotencyKey: IDEMPOTENCY_KEY, message }),
  });
}

/**
 * Builds the route over a real Commerce Agent so the Guest Session resolved
 * from the request cookie is what actually scopes the Cart read.
 */
function cartInspectionRoute(options: {
  store: GuestSessionStore;
  requestedEffects: IntentAnalysis["requestedEffects"];
  readCart: (guestSessionId: string) => Promise<CartView>;
  agentLoop?: CommerceAgentLoop;
  issueToken?: () => string;
}) {
  return createMessageRoute({
    store: options.store,
    ...(options.issueToken ? { issueToken: options.issueToken } : {}),
    async createAgent(guestSession) {
      return createCommerceAgent(
        unusedCatalog,
        analyzerRequesting(options.requestedEffects),
        conversationForTurn("21000000-0000-4000-8000-000000000001"),
        {
          agentLoop: options.agentLoop ?? rejectingLoop,
          cartInspection: createCartInspection(
            guestSession.id,
            (guestSessionId) => ({
              inspect: () => options.readCart(guestSessionId),
            }),
          ),
        },
      );
    },
  });
}

test("a Cart-dependent message returns only the Cart owned by the requesting browser", async () => {
  const route = cartInspectionRoute({
    store: guestSessionStore({
      "owner-token": "guest-session-1",
      "other-token": "guest-session-2",
    }),
    requestedEffects: ["INSPECT_CART"],
    async readCart(guestSessionId) {
      return CARTS_BY_GUEST_SESSION.get(guestSessionId) ?? EMPTY_CART;
    },
  });

  const response = await route(
    messageRequest("What is in my Cart?", "owner-token"),
  );
  const payload = (await response.json()) as { data: AgentOutcome };

  assert.equal(response.status, 200);
  assert.deepEqual(payload.data.cart, OWNED_CART);
});

test("an unrelated message never reads the Cart", async () => {
  let inspections = 0;
  const route = cartInspectionRoute({
    store: guestSessionStore({ "owner-token": "guest-session-1" }),
    requestedEffects: ["DISCOVER_PRODUCTS"],
    agentLoop: {
      async run() {
        return {
          status: "COMPLETED",
          message: "Here are two running shoes.",
          productIds: [],
        };
      },
    },
    async readCart() {
      inspections += 1;
      return OWNED_CART;
    },
  });

  const response = await route(
    messageRequest("Show me running shoes.", "owner-token"),
  );
  const payload = (await response.json()) as { data: Record<string, unknown> };

  assert.equal(payload.data.status, "COMPLETED");
  assert.equal(inspections, 0);
  assert.equal(Object.hasOwn(payload.data, "cart"), false);
});

test("a failed Cart inspection returns a retryable status without Cart values", async () => {
  const route = cartInspectionRoute({
    store: guestSessionStore({ "owner-token": "guest-session-1" }),
    requestedEffects: ["INSPECT_CART"],
    async readCart(): Promise<CartView> {
      throw new Error("The Cart is unavailable.");
    },
  });

  const response = await route(
    messageRequest("What is in my Cart?", "owner-token"),
  );
  const payload = (await response.json()) as { data: AgentOutcome };

  assert.equal(response.status, 200);
  assert.equal(payload.data.status, "TEMPORARILY_UNAVAILABLE");
  assert.equal(payload.data.retryable, true);
  assert.equal(payload.data.cart, undefined);
  assert.equal(/[\d₹]/.test(payload.data.message), false);
});

test("a Cart-dependent message from an unowned browser inspects its own new Cart", async () => {
  const owners: string[] = [];
  const route = cartInspectionRoute({
    store: guestSessionStore({ "owner-token": "guest-session-1" }),
    requestedEffects: ["INSPECT_CART"],
    issueToken: () => "new-owner-token",
    async readCart(guestSessionId) {
      owners.push(guestSessionId);
      return CARTS_BY_GUEST_SESSION.get(guestSessionId) ?? EMPTY_CART;
    },
  });

  const response = await route(
    messageRequest("What is in my Cart?", "someone-elses-token"),
  );
  const payload = (await response.json()) as { data: AgentOutcome };

  assert.deepEqual(owners, ["guest-session-3"]);
  assert.deepEqual(payload.data.cart, EMPTY_CART);
  assert.match(
    response.headers.get("set-cookie") ?? "",
    /guest_session=new-owner-token/,
  );
});
