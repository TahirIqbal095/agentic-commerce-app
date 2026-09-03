import assert from "node:assert/strict";
import test from "node:test";
import {
  CHECKOUT_READINESS_ACTION_MESSAGE,
  type CheckoutReadinessActionEntry,
} from "@/modules/agent/customer-action-entry";
import type {
  CartModule,
  CartReviewSource,
  CartWithProductAvailability,
} from "@/modules/cart/cart";
import { createCartReviewRead } from "@/modules/cart/cart-inspection";
import {
  createCheckoutReadinessReview,
  type CheckoutReadiness,
} from "@/modules/cart/checkout-readiness";
import type {
  GuestSession,
  GuestSessionStore,
} from "@/modules/identity/guest-session";
import { createCheckoutReadinessRoute } from "./route-factory";

const stockedReadiness: CheckoutReadiness = {
  status: "READY",
  cart: {
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
  },
  blockers: [],
};

const emptyReadiness: CheckoutReadiness = {
  status: "NOT_READY",
  cart: {
    id: null,
    version: 0,
    items: [],
    totalQuantity: 0,
    subtotalMinor: 0,
    currency: "INR",
  },
  blockers: [
    {
      code: "CART_EMPTY",
      message: "Add at least one Product to the Cart before checkout.",
    },
  ],
};

function memoryGuestSessionStore(): GuestSessionStore {
  const sessionsByTokenHash = new Map<string, GuestSession>();
  let created = 0;
  return {
    async findActive(tokenHash) {
      return sessionsByTokenHash.get(tokenHash) ?? null;
    },
    async create({ tokenHash }) {
      created += 1;
      const session = { id: `guest-session-${created}` };
      sessionsByTokenHash.set(tokenHash, session);
      return session;
    },
    async refresh() {},
  };
}

function recordingConversationState() {
  const recorded: Array<{
    guestSessionId: string;
    readiness: CheckoutReadiness;
  }> = [];
  return {
    recorded,
    createState(guestSession: GuestSession) {
      return {
        async loadCurrent() {
          throw new Error("Readiness never reads the Conversation Context");
        },
        async resetCurrent() {},
        async recordCheckoutReadiness(readiness: CheckoutReadiness) {
          recorded.push({ guestSessionId: guestSession.id, readiness });
          return {
            id: "51000000-0000-4000-8000-000000000001",
            action: "CHECKOUT_READINESS",
            message: CHECKOUT_READINESS_ACTION_MESSAGE,
            provenance: "GENERATED",
            readiness,
          } satisfies CheckoutReadinessActionEntry;
        },
      };
    },
  };
}

function reviewRequest(cookie?: string) {
  return new Request(
    "https://storefront.example/api/cart/checkout-readiness",
    {
      method: "POST",
      ...(cookie ? { headers: { cookie } } : {}),
    },
  );
}

test("an explicit Review for checkout returns the readiness of the authoritative Cart", async () => {
  const conversation = recordingConversationState();
  const route = createCheckoutReadinessRoute({
    store: memoryGuestSessionStore(),
    issueToken: () => "reviewing-browser-token",
    createState: conversation.createState,
    createReview(guestSession) {
      assert.equal(guestSession.id, "guest-session-1");
      return {
        async review() {
          return stockedReadiness;
        },
      };
    },
  });

  const response = await route(reviewRequest());

  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie") ?? "", /^guest_session=/);
  assert.deepEqual(await response.json(), {
    data: {
      id: "51000000-0000-4000-8000-000000000001",
      action: "CHECKOUT_READINESS",
      message: CHECKOUT_READINESS_ACTION_MESSAGE,
      provenance: "GENERATED",
      readiness: stockedReadiness,
    },
  });
});

test("the readiness entry is recorded in the Conversation Transcript", async () => {
  const conversation = recordingConversationState();
  const route = createCheckoutReadinessRoute({
    store: memoryGuestSessionStore(),
    issueToken: () => "reviewing-browser-token",
    createState: conversation.createState,
    createReview: () => ({ async review() {
      return stockedReadiness;
    } }),
  });

  await route(reviewRequest());

  assert.deepEqual(conversation.recorded, [
    { guestSessionId: "guest-session-1", readiness: stockedReadiness },
  ]);
});

test("an empty Cart returns a not-ready entry that requires at least one Product", async () => {
  const conversation = recordingConversationState();
  const route = createCheckoutReadinessRoute({
    store: memoryGuestSessionStore(),
    issueToken: () => "reviewing-browser-token",
    createState: conversation.createState,
    createReview: () => ({ async review() {
      return emptyReadiness;
    } }),
  });

  const response = await route(reviewRequest());
  const payload = (await response.json()) as { data: CheckoutReadinessActionEntry };

  assert.equal(response.status, 200);
  assert.equal(payload.data.readiness.status, "NOT_READY");
  assert.deepEqual(payload.data.readiness.blockers, emptyReadiness.blockers);
  assert.deepEqual(payload.data.readiness.cart.items, []);
  assert.deepEqual(conversation.recorded, [
    { guestSessionId: "guest-session-1", readiness: emptyReadiness },
  ]);
});

test("a Guest Session reviews only the Cart owned by its own browser", async () => {
  const conversation = recordingConversationState();
  const readinessBySession: Record<string, CheckoutReadiness> = {
    "guest-session-1": stockedReadiness,
    "guest-session-2": emptyReadiness,
  };
  let issuedTokens = 0;
  const route = createCheckoutReadinessRoute({
    store: memoryGuestSessionStore(),
    issueToken: () => `browser-token-${(issuedTokens += 1)}`,
    createState: conversation.createState,
    createReview: (guestSession) => ({ async review() {
      return readinessBySession[guestSession.id];
    } }),
  });

  const owner = await route(reviewRequest());
  const ownerCookie = owner.headers.get("set-cookie")!.split(";", 1)[0];
  const otherBrowser = await route(reviewRequest("guest_session=someone-else"));
  const returning = await route(reviewRequest(ownerCookie));

  const otherPayload = (await otherBrowser.json()) as {
    data: CheckoutReadinessActionEntry;
  };
  const returningPayload = (await returning.json()) as {
    data: CheckoutReadinessActionEntry;
  };
  assert.equal(otherPayload.data.readiness.status, "NOT_READY");
  assert.equal(returningPayload.data.readiness.cart.version, 4);
  assert.deepEqual(
    conversation.recorded.map(({ guestSessionId }) => guestSessionId),
    ["guest-session-1", "guest-session-2", "guest-session-1"],
  );
});

test("a failed Cart read records nothing and returns a retryable failure", async () => {
  const conversation = recordingConversationState();
  const route = createCheckoutReadinessRoute({
    store: memoryGuestSessionStore(),
    issueToken: () => "reviewing-browser-token",
    createState: conversation.createState,
    createReview: () => ({ async review(): Promise<CheckoutReadiness> {
      throw new Error("Cart read failed");
    } }),
  });

  const response = await route(reviewRequest());

  assert.equal(response.status, 500);
  assert.deepEqual(conversation.recorded, []);
  const payload = (await response.json()) as { error: { code: string } };
  assert.equal(payload.error.code, "INTERNAL_ERROR");
});

const unsuppliableCart: CartWithProductAvailability = {
  id: "31000000-0000-4000-8000-000000000001",
  version: 7,
  items: [
    {
      productId: "11000000-0000-4000-8000-000000000001",
      productName: "Quiet Buds",
      quantity: 3,
      cartPriceMinor: 349900,
      subtotalMinor: 1049700,
      isAvailable: true,
      stock: 1,
    },
    {
      productId: "11000000-0000-4000-8000-000000000002",
      productName: "Trail Runner",
      quantity: 1,
      cartPriceMinor: 899900,
      subtotalMinor: 899900,
      isAvailable: false,
      stock: 4,
    },
  ],
  totalQuantity: 4,
  subtotalMinor: 1949600,
  currency: "INR",
};

/**
 * A Cart module whose every command fails the test.
 *
 * Reviewing is a read, so a route that reaches any of these has reserved
 * inventory or changed the Cart on the Customer's behalf.
 */
function readOnlyCartModule(
  cart: CartWithProductAvailability,
): CartModule & CartReviewSource {
  const command = async () => {
    throw new Error("A Checkout Readiness review must change no Cart state.");
  };
  return {
    inspect: command,
    inspectForReview: async () => cart,
    addItem: command,
    addItems: command,
    changeItemQuantity: command,
    removeItem: command,
    replayMutation: command,
  };
}

/**
 * Builds the route over a real review of `cart`, so a test drives the readiness
 * rules through the same composition the Storefront uses.
 */
function routeReviewing(
  cart: CartWithProductAvailability,
  conversation: ReturnType<typeof recordingConversationState>,
) {
  return createCheckoutReadinessRoute({
    store: memoryGuestSessionStore(),
    issueToken: () => "reviewing-browser-token",
    createState: conversation.createState,
    createReview: (guestSession) =>
      createCheckoutReadinessReview(
        createCartReviewRead(guestSession.id, () => readOnlyCartModule(cart)),
      ),
  });
}

test("a Cart the Catalog can no longer supply returns a blocker for each affected Cart Item", async () => {
  const conversation = recordingConversationState();
  const route = routeReviewing(unsuppliableCart, conversation);

  const response = await route(reviewRequest());
  const payload = (await response.json()) as { data: CheckoutReadinessActionEntry };

  assert.equal(response.status, 200);
  assert.equal(payload.data.readiness.status, "NOT_READY");
  assert.deepEqual(payload.data.readiness.blockers, [
    {
      code: "INSUFFICIENT_STOCK",
      productId: "11000000-0000-4000-8000-000000000001",
      productName: "Quiet Buds",
      message:
        "Quiet Buds only has 1 unit in stock. Reduce the quantity to 1, or remove it from the Cart.",
    },
    {
      code: "PRODUCT_UNAVAILABLE",
      productId: "11000000-0000-4000-8000-000000000002",
      productName: "Trail Runner",
      message:
        "Trail Runner is no longer available. Remove it from the Cart to continue.",
    },
  ]);
  assert.deepEqual(conversation.recorded, [
    {
      guestSessionId: "guest-session-1",
      readiness: payload.data.readiness,
    },
  ]);
});

test("a blocked review returns the evaluated Cart unchanged and reserves nothing", async () => {
  const conversation = recordingConversationState();
  const route = routeReviewing(unsuppliableCart, conversation);

  const response = await route(reviewRequest());
  const payload = (await response.json()) as { data: CheckoutReadinessActionEntry };

  assert.equal(response.status, 200);
  assert.equal(payload.data.readiness.cart.version, 7);
  assert.deepEqual(payload.data.readiness.cart.items, [
    {
      productId: "11000000-0000-4000-8000-000000000001",
      productName: "Quiet Buds",
      quantity: 3,
      cartPriceMinor: 349900,
      subtotalMinor: 1049700,
    },
    {
      productId: "11000000-0000-4000-8000-000000000002",
      productName: "Trail Runner",
      quantity: 1,
      cartPriceMinor: 899900,
      subtotalMinor: 899900,
    },
  ]);
});

test("a successful review returns no reservation, expiry, or payment state", async () => {
  const conversation = recordingConversationState();
  const route = routeReviewing({
            ...unsuppliableCart,
            items: [
              {
                ...unsuppliableCart.items[0],
                quantity: 1,
                subtotalMinor: 349900,
              },
            ],
            totalQuantity: 1,
            subtotalMinor: 349900,
          }, conversation);

  const response = await route(reviewRequest());
  const payload = (await response.json()) as { data: CheckoutReadinessActionEntry };

  assert.equal(payload.data.readiness.status, "READY");
  assert.deepEqual(Object.keys(payload.data.readiness).sort(), [
    "blockers",
    "cart",
    "status",
  ]);
  assert.deepEqual(Object.keys(payload.data).sort(), [
    "action",
    "id",
    "message",
    "provenance",
    "readiness",
  ]);
  assert.deepEqual(Object.keys(payload.data.readiness.cart.items[0]).sort(), [
    "cartPriceMinor",
    "productId",
    "productName",
    "quantity",
    "subtotalMinor",
  ]);
});

test("a Cart Item above the authoritative quantity limit is blocked through the route", async () => {
  const conversation = recordingConversationState();
  const route = routeReviewing({
            ...unsuppliableCart,
            items: [
              {
                ...unsuppliableCart.items[0],
                quantity: 11,
                subtotalMinor: 3848900,
                stock: 40,
              },
            ],
            totalQuantity: 11,
            subtotalMinor: 3848900,
          }, conversation);

  const response = await route(reviewRequest());
  const payload = (await response.json()) as { data: CheckoutReadinessActionEntry };

  assert.equal(payload.data.readiness.status, "NOT_READY");
  assert.deepEqual(payload.data.readiness.blockers, [
    {
      code: "QUANTITY_LIMIT_EXCEEDED",
      productId: "11000000-0000-4000-8000-000000000001",
      productName: "Quiet Buds",
      message:
        "Quiet Buds cannot have more than 10 units in the Cart. Reduce the quantity to 10 or fewer.",
    },
  ]);
});

test("a Cart priced outside Indian rupees is blocked through the route", async () => {
  const conversation = recordingConversationState();
  const route = routeReviewing(
    {
      ...unsuppliableCart,
      items: [{ ...unsuppliableCart.items[0], quantity: 1, subtotalMinor: 349900 }],
      totalQuantity: 1,
      subtotalMinor: 349900,
      currency: "USD",
    },
    conversation,
  );

  const response = await route(reviewRequest());
  const payload = (await response.json()) as { data: CheckoutReadinessActionEntry };

  assert.equal(payload.data.readiness.status, "NOT_READY");
  assert.deepEqual(payload.data.readiness.blockers, [
    {
      code: "CURRENCY_UNSUPPORTED",
      message:
        "This Cart is priced in USD, but the Storefront supports Indian rupees (INR) only. It cannot be reviewed for checkout.",
    },
  ]);
  assert.equal(payload.data.readiness.cart.currency, "USD");
});
