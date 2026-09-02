import assert from "node:assert/strict";
import test from "node:test";
import { CartError, type CartModule, type CartView } from "@/modules/cart/cart";
import type { CatalogModule } from "@/modules/catalog/catalog";
import {
  createGuestSessionRoute,
  type GuestSession,
  type GuestSessionStore,
} from "@/modules/identity/guest-session";
import { createAddToCartRoute, createCartRoute } from "./route-factory";

test("an explicit Add Product command returns the complete authoritative Cart", async () => {
  const product = {
    id: "11000000-0000-4000-8000-000000000001",
    slug: "quiet-buds",
    name: "Quiet Buds",
    description: "Compact wireless earphones.",
    category: "Audio",
    priceMinor: 349900,
    currency: "INR",
    inStock: true,
    attributes: {},
  };
  const authoritativeCart: CartView = {
    id: "31000000-0000-4000-8000-000000000001",
    items: [
      {
        productId: product.id,
        productName: product.name,
        quantity: 1,
        cartPriceMinor: 349900,
        subtotalMinor: 349900,
      },
    ],
    totalQuantity: 1,
    subtotalMinor: 349900,
    currency: "INR",
  };
  const store: GuestSessionStore = {
    async findActive() {
      return null;
    },
    async create() {
      return { id: "guest-session-1" };
    },
    async refresh() {},
  };
  const catalog: CatalogModule = {
    async search() {
      throw new Error("Search is not part of an explicit Add command");
    },
    async getProduct(productId) {
      assert.equal(productId, product.id);
      return { ok: true, value: product };
    },
  };
  const route = createAddToCartRoute({
    store,
    catalog,
    issueToken: () => "new-cart-browser-token",
    createCart(guestSession) {
      assert.equal(guestSession.id, "guest-session-1");
      return {
        async inspect() {
          throw new Error("Add returns its authoritative result directly");
        },
        async addItem(selectedProduct, quantity) {
          assert.deepEqual(selectedProduct, product);
          assert.equal(quantity, 1);
          return authoritativeCart;
        },
      };
    },
  });

  const response = await route(
    new Request("https://storefront.example/api/cart", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "ADD_PRODUCT",
        productId: product.id,
        mutationKey: "61000000-0000-4000-8000-000000000001",
      }),
    }),
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie") ?? "", /^guest_session=/);
  assert.deepEqual(await response.json(), { data: authoritativeCart });
});

test("a rejected Add returns the reason and unchanged authoritative Cart", async () => {
  const product = {
    id: "11000000-0000-4000-8000-000000000001",
    slug: "quiet-buds",
    name: "Quiet Buds",
    description: "Compact wireless earphones.",
    category: "Audio",
    priceMinor: 349900,
    currency: "INR",
    inStock: true,
    attributes: {},
  };
  const unchangedCart: CartView = {
    id: "31000000-0000-4000-8000-000000000001",
    items: [
      {
        productId: product.id,
        productName: product.name,
        quantity: 10,
        cartPriceMinor: 349900,
        subtotalMinor: 3499000,
      },
    ],
    totalQuantity: 10,
    subtotalMinor: 3499000,
    currency: "INR",
  };
  const route = createAddToCartRoute({
    store: {
      async findActive() {
        return { id: "guest-session-1" };
      },
      async create() {
        throw new Error("The existing Guest Session should be reused");
      },
      async refresh() {},
    },
    catalog: {
      async search() {
        throw new Error("not used");
      },
      async getProduct() {
        return { ok: true, value: product };
      },
    },
    createCart() {
      return {
        async inspect() {
          return unchangedCart;
        },
        async addItem() {
          throw new CartError(
            "Quiet Buds cannot have more than 10 units in the Cart.",
          );
        },
      };
    },
  });

  const response = await route(
    new Request("https://storefront.example/api/cart", {
      method: "POST",
      headers: {
        cookie: "guest_session=returning-cart-browser-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        type: "ADD_PRODUCT",
        productId: product.id,
        mutationKey: "61000000-0000-4000-8000-000000000002",
      }),
    }),
  );

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: {
      code: "CART_RULE_REJECTED",
      message: "Quiet Buds cannot have more than 10 units in the Cart.",
      details: { cart: unchangedCart },
    },
  });
});

test("an unavailable Product is rejected without changing the Cart", async () => {
  const unchangedCart: CartView = {
    id: null,
    items: [],
    totalQuantity: 0,
    subtotalMinor: 0,
    currency: "INR",
  };
  let addAttempted = false;
  const route = createAddToCartRoute({
    store: {
      async findActive() {
        return null;
      },
      async create() {
        return { id: "guest-session-1" };
      },
      async refresh() {},
    },
    issueToken: () => "new-cart-browser-token",
    catalog: {
      async search() {
        throw new Error("not used");
      },
      async getProduct() {
        return {
          ok: false,
          error: {
            code: "PRODUCT_NOT_FOUND",
            message: "The requested product was not found.",
            details: {},
          },
        };
      },
    },
    createCart() {
      return {
        async inspect() {
          return unchangedCart;
        },
        async addItem() {
          addAttempted = true;
          throw new Error("An unavailable Product must not be added");
        },
      };
    },
  });

  const response = await route(
    new Request("https://storefront.example/api/cart", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "ADD_PRODUCT",
        productId: "11000000-0000-4000-8000-000000000001",
        mutationKey: "61000000-0000-4000-8000-000000000003",
      }),
    }),
  );

  assert.equal(addAttempted, false);
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: {
      code: "PRODUCT_UNAVAILABLE",
      message: "The Product is not available.",
      details: { cart: unchangedCart },
    },
  });
});

test("an Add command requires a client-generated mutation key", async () => {
  const route = createAddToCartRoute({
    store: {
      async findActive() {
        return null;
      },
      async create() {
        return { id: "guest-session-1" };
      },
      async refresh() {},
    },
    issueToken: () => "new-cart-browser-token",
    catalog: {
      async search() {
        throw new Error("not used");
      },
      async getProduct() {
        throw new Error("An invalid command must not read the Catalog");
      },
    },
    createCart() {
      throw new Error("An invalid command must not access the Cart");
    },
  });

  const response = await route(
    new Request("https://storefront.example/api/cart", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "ADD_PRODUCT",
        productId: "11000000-0000-4000-8000-000000000001",
      }),
    }),
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: {
      code: "INVALID_CART_COMMAND",
      message: "mutationKey must be a UUID.",
      details: { field: "mutationKey" },
    },
  });
});

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
      headers: {
        cookie: secondBrowser.headers.get("set-cookie")!.split(";", 1)[0],
      },
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

test("an expired Guest Session cannot resume its former Cart", async () => {
  const expiredAt = new Date("2026-09-01T00:00:00.000Z");
  const store: GuestSessionStore = {
    async findActive(_tokenHash, now) {
      assert.equal(now.toISOString(), "2026-09-01T00:00:00.001Z");
      return now < expiredAt ? { id: "expired-guest-session" } : null;
    },
    async create() {
      throw new Error("Reading a Cart must not create a Guest Session");
    },
    async refresh() {
      throw new Error("An expired Guest Session must not be refreshed");
    },
  };
  const route = createCartRoute({
    store,
    now: () => new Date("2026-09-01T00:00:00.001Z"),
    createCart() {
      throw new Error("An expired Guest Session must not expose its Cart");
    },
  });

  const response = await route(
    new Request("https://storefront.example/api/cart", {
      headers: { cookie: "guest_session=expired-browser-token" },
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.has("set-cookie"), false);
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
