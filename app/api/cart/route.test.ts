import assert from "node:assert/strict";
import test from "node:test";
import type { CartModule, CartView } from "@/modules/cart/cart";
import {
  createGuestSessionRoute,
  type GuestSession,
  type GuestSessionStore,
} from "@/modules/identity/guest-session";
import { createCartRoute } from "./route-factory";

test("returning with the same valid cookie resumes the current Cart", async () => {
  const sessionsByTokenHash = new Map<string, GuestSession>();
  const cartBySessionId = new Map<string, CartView>();
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
    async (_request, guestSession) => {
      cartBySessionId.set(guestSession.id, {
        id: "31000000-0000-4000-8000-000000000001",
        items: [],
        totalQuantity: 3,
        subtotalMinor: 1299700,
        currency: "INR",
      });
      return new Response(null, { status: 204 });
    },
    { store, issueToken: () => "returning-cart-browser-token" },
  );
  const creationResponse = await createSession(
    new Request("https://storefront.example/api/stateful", { method: "POST" }),
  );
  const cookie = creationResponse.headers.get("set-cookie")?.split(";", 1)[0];
  assert.ok(cookie);
  const route = createCartRoute({
    store,
    createCart(guestSession) {
      const cart: CartModule = {
        async inspect() {
          return cartBySessionId.get(guestSession.id)!;
        },
        async addItem() {
          throw new Error("The Cart route is read-only");
        },
      };
      return cart;
    },
  });

  const response = await route(
    new Request("https://storefront.example/api/cart", {
      headers: { cookie },
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    data: cartBySessionId.get("guest-session-1"),
  });
});

test("a Guest Session cannot read another Guest Session's Cart", async () => {
  const sessionsByTokenHash = new Map<string, GuestSession>();
  const cartBySessionId = new Map<string, CartView>();
  let nextSession = 0;
  const store: GuestSessionStore = {
    async findActive(tokenHash) {
      return sessionsByTokenHash.get(tokenHash) ?? null;
    },
    async create({ tokenHash }) {
      nextSession += 1;
      const session = { id: `guest-session-${nextSession}` };
      sessionsByTokenHash.set(tokenHash, session);
      return session;
    },
    async refresh() {},
  };
  const createSession = createGuestSessionRoute(
    async () => new Response(null, { status: 204 }),
    { store, issueToken: () => `opaque-token-${nextSession + 1}` },
  );
  const firstBrowser = await createSession(
    new Request("https://storefront.example/api/stateful", { method: "POST" }),
  );
  const secondBrowser = await createSession(
    new Request("https://storefront.example/api/stateful", { method: "POST" }),
  );
  cartBySessionId.set("guest-session-1", {
    id: "31000000-0000-4000-8000-000000000001",
    items: [],
    totalQuantity: 2,
    subtotalMinor: 799800,
    currency: "INR",
  });
  const route = createCartRoute({
    store,
    createCart(guestSession) {
      return {
        async inspect() {
          return (
            cartBySessionId.get(guestSession.id) ?? {
              id: null,
              items: [],
              totalQuantity: 0,
              subtotalMinor: 0,
              currency: "INR",
            }
          );
        },
        async addItem() {
          throw new Error("The Cart route is read-only");
        },
      };
    },
  });
  const response = await route(
    new Request("https://storefront.example/api/cart", {
      headers: { cookie: secondBrowser.headers.get("set-cookie")!.split(";", 1)[0] },
    }),
  );

  assert.match(firstBrowser.headers.get("set-cookie") ?? "", /^guest_session=/);
  assert.deepEqual(await response.json(), {
    data: {
      id: null,
      items: [],
      totalQuantity: 0,
      subtotalMinor: 0,
      currency: "INR",
    },
  });
});
