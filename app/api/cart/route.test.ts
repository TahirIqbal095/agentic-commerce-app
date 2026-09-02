import assert from "node:assert/strict";
import test from "node:test";
import {
  CartConflictError,
  CartError,
  type CartModule,
  type CartView,
} from "@/modules/cart/cart";
import type { CatalogModule } from "@/modules/catalog/catalog";
import {
  createGuestSessionRoute,
  type GuestSession,
  type GuestSessionStore,
} from "@/modules/identity/guest-session";
import {
  createAddToCartRoute,
  createCartRoute,
  createRemoveCartItemRoute,
  createUpdateCartItemRoute,
} from "./route-factory";

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
    version: 1,
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
        expectedVersion: 0,
      }),
    }),
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie") ?? "", /^guest_session=/);
  assert.deepEqual(await response.json(), { data: authoritativeCart });
});

test("replaying an Add returns its stored Cart before rereading Product availability", async () => {
  const productId = "11000000-0000-4000-8000-000000000001";
  const storedCart: CartView = {
    id: "31000000-0000-4000-8000-000000000001",
    version: 2,
    items: [
      {
        productId,
        productName: "Quiet Buds",
        quantity: 1,
        cartPriceMinor: 349900,
        subtotalMinor: 349900,
      },
    ],
    totalQuantity: 1,
    subtotalMinor: 349900,
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
        throw new Error("Search is not part of an explicit Add command");
      },
      async getProduct() {
        throw new Error("A replay must not reread Product availability");
      },
    },
    createCart() {
      return {
        async inspect() {
          throw new Error("A successful replay returns its stored result");
        },
        async addItem() {
          throw new Error("A replay must not add the Product again");
        },
        async replayMutation() {
          return storedCart;
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
        productId,
        mutationKey: "61000000-0000-4000-8000-000000000011",
        expectedVersion: 0,
      }),
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { data: storedCart });
});

test("incrementing a Cart Item returns the complete authoritative Cart", async () => {
  const productId = "11000000-0000-4000-8000-000000000001";
  const authoritativeCart: CartView = {
    id: "31000000-0000-4000-8000-000000000001",
    version: 1,
    items: [
      {
        productId,
        productName: "Quiet Buds",
        quantity: 3,
        cartPriceMinor: 349900,
        subtotalMinor: 1049700,
      },
    ],
    totalQuantity: 3,
    subtotalMinor: 1049700,
    currency: "INR",
  };
  const route = createUpdateCartItemRoute({
    store: {
      async findActive() {
        return { id: "guest-session-1" };
      },
      async create() {
        throw new Error("The existing Guest Session should be reused");
      },
      async refresh() {},
    },
    createCart(guestSession) {
      assert.equal(guestSession.id, "guest-session-1");
      return {
        async inspect() {
          throw new Error("The successful command returns its result directly");
        },
        async addItem() {
          throw new Error("Increment must not use the Add Product capability");
        },
        async changeItemQuantity(selectedProductId, change) {
          assert.equal(selectedProductId, productId);
          assert.equal(change, 1);
          return authoritativeCart;
        },
      };
    },
  });

  const response = await route(
    new Request("https://storefront.example/api/cart", {
      method: "PATCH",
      headers: {
        cookie: "guest_session=returning-cart-browser-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        type: "INCREMENT_ITEM",
        productId,
        mutationKey: "61000000-0000-4000-8000-000000000004",
        expectedVersion: 1,
      }),
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { data: authoritativeCart });
});

test("replaying the same Cart Item command returns its original authoritative result", async () => {
  const productId = "11000000-0000-4000-8000-000000000001";
  let quantity = 1;
  const resultsByMutationKey = new Map<string, CartView>();
  const route = createUpdateCartItemRoute({
    store: {
      async findActive() {
        return { id: "guest-session-1" };
      },
      async create() {
        throw new Error("The existing Guest Session should be reused");
      },
      async refresh() {},
    },
    createCart() {
      return {
        async inspect() {
          throw new Error("A successful replay returns its stored result");
        },
        async addItem() {
          throw new Error("Increment must not use the Add Product capability");
        },
        async changeItemQuantity(
          _selectedProductId,
          _change,
          _complete,
          ...rest: unknown[]
        ) {
          const mutation = rest[0] as
            | { mutationKey: string; expectedVersion: number }
            | undefined;
          const key = mutation?.mutationKey ?? crypto.randomUUID();
          const replay = resultsByMutationKey.get(key);
          if (replay) return replay;
          quantity += 1;
          const result: CartView = {
            id: "31000000-0000-4000-8000-000000000001",
            version: 1,
            items: [
              {
                productId,
                productName: "Quiet Buds",
                quantity,
                cartPriceMinor: 349900,
                subtotalMinor: quantity * 349900,
              },
            ],
            totalQuantity: quantity,
            subtotalMinor: quantity * 349900,
            currency: "INR",
          };
          resultsByMutationKey.set(key, result);
          return result;
        },
      };
    },
  });
  const command = {
    type: "INCREMENT_ITEM",
    productId,
    mutationKey: "61000000-0000-4000-8000-000000000010",
    expectedVersion: 1,
  };

  const first = await route(
    new Request("https://storefront.example/api/cart", {
      method: "PATCH",
      headers: {
        cookie: "guest_session=returning-cart-browser-token",
        "content-type": "application/json",
      },
      body: JSON.stringify(command),
    }),
  );
  const replay = await route(
    new Request("https://storefront.example/api/cart", {
      method: "PATCH",
      headers: {
        cookie: "guest_session=returning-cart-browser-token",
        "content-type": "application/json",
      },
      body: JSON.stringify(command),
    }),
  );

  assert.deepEqual(await first.json(), await replay.json());
  assert.equal(quantity, 2);
});

test("decrementing at one keeps the Cart Item and returns the authoritative reason", async () => {
  const productId = "11000000-0000-4000-8000-000000000001";
  const unchangedCart: CartView = {
    id: "31000000-0000-4000-8000-000000000001",
    version: 1,
    items: [
      {
        productId,
        productName: "Quiet Buds",
        quantity: 1,
        cartPriceMinor: 349900,
        subtotalMinor: 349900,
      },
    ],
    totalQuantity: 1,
    subtotalMinor: 349900,
    currency: "INR",
  };
  const route = createUpdateCartItemRoute({
    store: {
      async findActive() {
        return { id: "guest-session-1" };
      },
      async create() {
        throw new Error("The existing Guest Session should be reused");
      },
      async refresh() {},
    },
    createCart() {
      return {
        async inspect() {
          return unchangedCart;
        },
        async addItem() {
          throw new Error("Decrement must not use the Add Product capability");
        },
        async changeItemQuantity(selectedProductId, change) {
          assert.equal(selectedProductId, productId);
          assert.equal(change, -1);
          throw new CartError(
            "Quiet Buds quantity cannot be lower than 1. Use Remove instead.",
          );
        },
      };
    },
  });

  const response = await route(
    new Request("https://storefront.example/api/cart", {
      method: "PATCH",
      headers: {
        cookie: "guest_session=returning-cart-browser-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        type: "DECREMENT_ITEM",
        productId,
        mutationKey: "61000000-0000-4000-8000-000000000005",
        expectedVersion: 1,
      }),
    }),
  );

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: {
      code: "CART_RULE_REJECTED",
      message: "Quiet Buds quantity cannot be lower than 1. Use Remove instead.",
      details: { cart: unchangedCart },
    },
  });
});

test("decrementing a Cart Item returns the lower authoritative quantity", async () => {
  const productId = "11000000-0000-4000-8000-000000000001";
  const authoritativeCart: CartView = {
    id: "31000000-0000-4000-8000-000000000001",
    version: 1,
    items: [
      {
        productId,
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
  const route = createUpdateCartItemRoute({
    store: {
      async findActive() {
        return { id: "guest-session-1" };
      },
      async create() {
        throw new Error("The existing Guest Session should be reused");
      },
      async refresh() {},
    },
    createCart() {
      return {
        async inspect() {
          throw new Error("The successful command returns its result directly");
        },
        async addItem() {
          throw new Error("Decrement must not use the Add Product capability");
        },
        async changeItemQuantity(selectedProductId, change) {
          assert.equal(selectedProductId, productId);
          assert.equal(change, -1);
          return authoritativeCart;
        },
      };
    },
  });

  const response = await route(
    new Request("https://storefront.example/api/cart", {
      method: "PATCH",
      headers: {
        cookie: "guest_session=returning-cart-browser-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        type: "DECREMENT_ITEM",
        productId,
        mutationKey: "61000000-0000-4000-8000-000000000009",
        expectedVersion: 1,
      }),
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { data: authoritativeCart });
});

test("removing a Cart Item returns the authoritative remaining Cart", async () => {
  const removedProductId = "11000000-0000-4000-8000-000000000001";
  const authoritativeCart: CartView = {
    id: "31000000-0000-4000-8000-000000000001",
    version: 1,
    items: [
      {
        productId: "11000000-0000-4000-8000-000000000002",
        productName: "Trail Speaker",
        quantity: 2,
        cartPriceMinor: 249900,
        subtotalMinor: 499800,
      },
    ],
    totalQuantity: 2,
    subtotalMinor: 499800,
    currency: "INR",
  };
  const route = createRemoveCartItemRoute({
    store: {
      async findActive() {
        return { id: "guest-session-1" };
      },
      async create() {
        throw new Error("The existing Guest Session should be reused");
      },
      async refresh() {},
    },
    createCart() {
      return {
        async inspect() {
          throw new Error("The successful command returns its result directly");
        },
        async addItem() {
          throw new Error("Remove must not use the Add Product capability");
        },
        async removeItem(productId) {
          assert.equal(productId, removedProductId);
          return authoritativeCart;
        },
      };
    },
  });

  const response = await route(
    new Request("https://storefront.example/api/cart", {
      method: "DELETE",
      headers: {
        cookie: "guest_session=returning-cart-browser-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        type: "REMOVE_ITEM",
        productId: removedProductId,
        mutationKey: "61000000-0000-4000-8000-000000000006",
        expectedVersion: 1,
      }),
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { data: authoritativeCart });
});

test("incrementing beyond the authoritative limit returns the unchanged Cart", async () => {
  const productId = "11000000-0000-4000-8000-000000000001";
  const unchangedCart: CartView = {
    id: "31000000-0000-4000-8000-000000000001",
    version: 1,
    items: [
      {
        productId,
        productName: "Quiet Buds",
        quantity: 4,
        cartPriceMinor: 349900,
        subtotalMinor: 1399600,
      },
    ],
    totalQuantity: 4,
    subtotalMinor: 1399600,
    currency: "INR",
  };
  const route = createUpdateCartItemRoute({
    store: {
      async findActive() {
        return { id: "guest-session-1" };
      },
      async create() {
        throw new Error("The existing Guest Session should be reused");
      },
      async refresh() {},
    },
    createCart() {
      return {
        async inspect() {
          return unchangedCart;
        },
        async addItem() {
          throw new Error("Increment must not use the Add Product capability");
        },
        async changeItemQuantity() {
          throw new CartError("Quiet Buds only has 4 units in stock.");
        },
      };
    },
  });

  const response = await route(
    new Request("https://storefront.example/api/cart", {
      method: "PATCH",
      headers: {
        cookie: "guest_session=returning-cart-browser-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        type: "INCREMENT_ITEM",
        productId,
        mutationKey: "61000000-0000-4000-8000-000000000007",
        expectedVersion: 1,
      }),
    }),
  );

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: {
      code: "CART_RULE_REJECTED",
      message: "Quiet Buds only has 4 units in stock.",
      details: { cart: unchangedCart },
    },
  });
});

test("removing the final Cart Item returns the authoritative empty Cart", async () => {
  const emptyCart: CartView = {
    id: "31000000-0000-4000-8000-000000000001",
    version: 1,
    items: [],
    totalQuantity: 0,
    subtotalMinor: 0,
    currency: "INR",
  };
  const route = createRemoveCartItemRoute({
    store: {
      async findActive() {
        return { id: "guest-session-1" };
      },
      async create() {
        throw new Error("The existing Guest Session should be reused");
      },
      async refresh() {},
    },
    createCart() {
      return {
        async inspect() {
          throw new Error("The successful command returns its result directly");
        },
        async addItem() {
          throw new Error("Remove must not use the Add Product capability");
        },
        async removeItem() {
          return emptyCart;
        },
      };
    },
  });

  const response = await route(
    new Request("https://storefront.example/api/cart", {
      method: "DELETE",
      headers: {
        cookie: "guest_session=returning-cart-browser-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        type: "REMOVE_ITEM",
        productId: "11000000-0000-4000-8000-000000000001",
        mutationKey: "61000000-0000-4000-8000-000000000008",
        expectedVersion: 1,
      }),
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { data: emptyCart });
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
    version: 1,
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
        expectedVersion: 1,
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
    version: 0,
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
        expectedVersion: 0,
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
        version: 1,
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
        async inspectForReview() {
          throw new Error("The Cart route never reviews the Cart");
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
    version: 1,
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
              version: 0,
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
      version: 0,
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
      version: 0,
      items: [],
      totalQuantity: 0,
      subtotalMinor: 0,
      currency: "INR",
    },
  });
});

test("a Cart command the authority cannot reconcile returns a typed conflict", async () => {
  const productId = "11000000-0000-4000-8000-000000000001";
  const latestCart: CartView = {
    id: "31000000-0000-4000-8000-000000000001",
    version: 7,
    items: [
      {
        productId,
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
  const route = createUpdateCartItemRoute({
    store: {
      async findActive() {
        return { id: "guest-session-1" };
      },
      async create() {
        throw new Error("The existing Guest Session should be reused");
      },
      async refresh() {},
    },
    createCart() {
      return {
        async inspect() {
          return latestCart;
        },
        async addItem() {
          throw new Error("Increment must not use the Add Product capability");
        },
        async changeItemQuantity() {
          throw new CartConflictError(
            "The Cart changed in another tab. Reload the Cart and try again.",
          );
        },
      };
    },
  });

  const response = await route(
    new Request("https://storefront.example/api/cart", {
      method: "PATCH",
      headers: {
        cookie: "guest_session=returning-cart-browser-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        type: "INCREMENT_ITEM",
        productId,
        mutationKey: "61000000-0000-4000-8000-000000000012",
        expectedVersion: 99,
      }),
    }),
  );

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: {
      code: "CART_CONFLICT",
      message: "The Cart changed in another tab. Reload the Cart and try again.",
      details: { cart: latestCart },
    },
  });
});

test("reusing one mutation key for a different Cart command returns a typed conflict", async () => {
  const latestCart: CartView = {
    id: "31000000-0000-4000-8000-000000000001",
    version: 3,
    items: [],
    totalQuantity: 0,
    subtotalMinor: 0,
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
        throw new Error("A reused mutation key must not reread the Catalog");
      },
    },
    createCart() {
      return {
        async inspect() {
          return latestCart;
        },
        async addItem() {
          throw new Error("A reused mutation key must not add the Product");
        },
        async replayMutation() {
          throw new CartConflictError(
            "The mutation key was already used for another Cart command.",
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
        productId: "11000000-0000-4000-8000-000000000001",
        mutationKey: "61000000-0000-4000-8000-000000000013",
        expectedVersion: 3,
      }),
    }),
  );

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: {
      code: "CART_CONFLICT",
      message: "The mutation key was already used for another Cart command.",
      details: { cart: latestCart },
    },
  });
});

test("removing a Cart Item another tab already removed returns a typed conflict", async () => {
  const latestCart: CartView = {
    id: "31000000-0000-4000-8000-000000000001",
    version: 5,
    items: [],
    totalQuantity: 0,
    subtotalMinor: 0,
    currency: "INR",
  };
  const route = createRemoveCartItemRoute({
    store: {
      async findActive() {
        return { id: "guest-session-1" };
      },
      async create() {
        throw new Error("The existing Guest Session should be reused");
      },
      async refresh() {},
    },
    createCart() {
      return {
        async inspect() {
          return latestCart;
        },
        async addItem() {
          throw new Error("Remove must not use the Add Product capability");
        },
        async removeItem() {
          throw new CartConflictError("The Cart Item is no longer in the Cart.");
        },
      };
    },
  });

  const response = await route(
    new Request("https://storefront.example/api/cart", {
      method: "DELETE",
      headers: {
        cookie: "guest_session=returning-cart-browser-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        type: "REMOVE_ITEM",
        productId: "11000000-0000-4000-8000-000000000001",
        mutationKey: "61000000-0000-4000-8000-000000000014",
        expectedVersion: 5,
      }),
    }),
  );

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: {
      code: "CART_CONFLICT",
      message: "The Cart Item is no longer in the Cart.",
      details: { cart: latestCart },
    },
  });
});

test("replaying one removal returns its original authoritative result once", async () => {
  const productId = "11000000-0000-4000-8000-000000000001";
  const remainingCart: CartView = {
    id: "31000000-0000-4000-8000-000000000001",
    version: 4,
    items: [],
    totalQuantity: 0,
    subtotalMinor: 0,
    currency: "INR",
  };
  let removals = 0;
  const resultsByMutationKey = new Map<string, CartView>();
  const route = createRemoveCartItemRoute({
    store: {
      async findActive() {
        return { id: "guest-session-1" };
      },
      async create() {
        throw new Error("The existing Guest Session should be reused");
      },
      async refresh() {},
    },
    createCart() {
      return {
        async inspect() {
          throw new Error("A successful replay returns its stored result");
        },
        async addItem() {
          throw new Error("Remove must not use the Add Product capability");
        },
        async removeItem(_productId, _complete, mutation) {
          const replay = resultsByMutationKey.get(mutation.mutationKey);
          if (replay) return replay;
          removals += 1;
          resultsByMutationKey.set(mutation.mutationKey, remainingCart);
          return remainingCart;
        },
      };
    },
  });
  const command = {
    type: "REMOVE_ITEM",
    productId,
    mutationKey: "61000000-0000-4000-8000-000000000015",
    expectedVersion: 3,
  };
  const removeRequest = () =>
    new Request("https://storefront.example/api/cart", {
      method: "DELETE",
      headers: {
        cookie: "guest_session=returning-cart-browser-token",
        "content-type": "application/json",
      },
      body: JSON.stringify(command),
    });

  const first = await route(removeRequest());
  const replay = await route(removeRequest());

  assert.equal(removals, 1);
  assert.deepEqual(await first.json(), { data: remainingCart });
  assert.deepEqual(await replay.json(), { data: remainingCart });
});
