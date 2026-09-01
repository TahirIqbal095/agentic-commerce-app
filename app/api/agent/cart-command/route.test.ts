import assert from "node:assert/strict";
import test from "node:test";
import type { DbExecutor } from "@/db";
import { createConversationModule } from "@/modules/agent/conversation";
import type { AgentOutcome } from "@/modules/agent/agent-outcome";
import type { ConversationRepository } from "@/modules/agent/conversation-repository";
import { createEmptyConversationContext } from "@/modules/agent/intent";
import { CartError, type CartModule, type CartView } from "@/modules/cart/cart";
import { createPostHandler } from "./handler";

const conversationId = "41000000-0000-4000-8000-000000000001";
const userId = "11000000-0000-4000-8000-000000000001";
const productId = "21000000-0000-4000-8000-000000000001";

test("structured Cart Item Removal creates a readable persisted turn with the authoritative Cart Summary", async () => {
  const customerMessages: string[] = [];
  const completedTurns: Array<{
    message: string;
    outcome: AgentOutcome;
    executor?: DbExecutor;
  }> = [];
  const repository: ConversationRepository = {
    async findDuplicate() { return null; },
    async create() { throw new Error("not used"); },
    async findOwnedContext() {
      return { userId, context: createEmptyConversationContext() };
    },
    async saveContextAndMetadata() {},
    async append(_conversationId, role, content) {
      if (role === "USER") customerMessages.push(content);
      return "51000000-0000-4000-8000-000000000001";
    },
    async finalizeTurn(_conversationId, _messageId, message, outcome, executor) {
      completedTurns.push({ message, outcome, executor });
    },
  };
  const originalCart: CartView = {
    id: "31000000-0000-4000-8000-000000000001",
    items: [
      {
        productId,
        productName: "Road Two",
        quantity: 1,
        cartPriceMinor: 390000,
        subtotalMinor: 390000,
      },
    ],
    totalQuantity: 1,
    subtotalMinor: 390000,
    currency: "INR",
  };
  const emptyCart: CartView = {
    id: originalCart.id,
    items: [],
    totalQuantity: 0,
    subtotalMinor: 0,
    currency: "INR",
  };
  const removedProductIds: string[] = [];
  const transaction = {} as DbExecutor;
  const cart: CartModule = {
    async inspect() { return originalCart; },
    async addItem() { throw new Error("not used"); },
    async addItems() { throw new Error("not used"); },
    async removeItem() { throw new Error("must remove by stable Product ID"); },
    async removeItemByProductId(removedProductId, complete, removalId) {
      removedProductIds.push(removedProductId);
      await complete(emptyCart, transaction, {
        cartItemRemovalUndo: {
          removalId: removalId!,
          productId,
          productName: "Road Two",
          expiresAt: "2026-09-01T06:30:10.000Z",
        },
      });
      return emptyCart;
    },
  };
  const POST = createPostHandler(async () => ({
    cart,
    conversation: createConversationModule(userId, repository),
  }));

  const response = await POST(new Request("http://localhost/api/agent/cart-command", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      conversationId,
      idempotencyKey: "61000000-0000-4000-8000-000000000001",
      command: { type: "REMOVE_CART_ITEM", productId },
    }),
  }));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(removedProductIds, [productId]);
  assert.deepEqual(customerMessages, ["Remove Road Two from my Cart"]);
  assert.equal(completedTurns.length, 1);
  assert.equal(completedTurns[0].executor, transaction);
  assert.deepEqual(completedTurns[0].outcome, payload.data);
  assert.equal(payload.data.message, "Removed Road Two from your Cart.");
  assert.deepEqual(payload.data.cart, emptyCart);
  assert.deepEqual(payload.data.cartItemRemovalUndo, {
    removalId: "61000000-0000-4000-8000-000000000001",
    productId,
    productName: "Road Two",
    expiresAt: "2026-09-01T06:30:10.000Z",
  });
});

test("Undo restores the exact removed Cart Item through its own persisted Conversation Turn", async () => {
  const removalId = "61000000-0000-4000-8000-000000000001";
  const restoredCart: CartView = {
    id: "31000000-0000-4000-8000-000000000001",
    items: [{
      productId,
      productName: "Road Two",
      quantity: 2,
      cartPriceMinor: 390000,
      subtotalMinor: 780000,
    }],
    totalQuantity: 2,
    subtotalMinor: 780000,
    currency: "INR",
  };
  const customerMessages: string[] = [];
  const completedTurns: AgentOutcome[] = [];
  const transaction = {} as DbExecutor;
  const repository: ConversationRepository = {
    async findDuplicate() { return null; },
    async create() { throw new Error("not used"); },
    async findOwnedContext() {
      return { userId, context: createEmptyConversationContext() };
    },
    async saveContextAndMetadata() {},
    async append(_conversationId, role, content) {
      if (role === "USER") customerMessages.push(content);
      return "51000000-0000-4000-8000-000000000002";
    },
    async finalizeTurn(_conversationId, _messageId, _message, outcome, executor) {
      assert.equal(executor, transaction);
      completedTurns.push(outcome);
    },
  };
  const restoredRemovalIds: string[] = [];
  const cart: CartModule = {
    async inspect() {
      return { ...restoredCart, items: [], totalQuantity: 0, subtotalMinor: 0 };
    },
    async addItem() { throw new Error("not used"); },
    async addItems() { throw new Error("not used"); },
    async restoreItemRemoval(restoredRemovalId, complete) {
      restoredRemovalIds.push(restoredRemovalId);
      await complete(restoredCart, transaction, {
        restoredItem: { productId, productName: "Road Two" },
      });
      return restoredCart;
    },
  };
  const POST = createPostHandler(async () => ({
    cart,
    conversation: createConversationModule(userId, repository),
  }));

  const response = await POST(new Request("http://localhost/api/agent/cart-command", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      conversationId,
      idempotencyKey: "61000000-0000-4000-8000-000000000002",
      command: { type: "UNDO_CART_ITEM_REMOVAL", removalId },
    }),
  }));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(restoredRemovalIds, [removalId]);
  assert.deepEqual(customerMessages, ["Undo the recent Cart Item Removal"]);
  assert.equal(completedTurns.length, 1);
  assert.deepEqual(completedTurns[0], payload.data);
  assert.equal(payload.data.message, "Restored Road Two to your Cart.");
  assert.deepEqual(payload.data.cart, restoredCart);
});

test("expired Undo persists the specific reason and leaves the authoritative Cart unchanged", async () => {
  const emptyCart: CartView = {
    id: "31000000-0000-4000-8000-000000000001",
    items: [],
    totalQuantity: 0,
    subtotalMinor: 0,
    currency: "INR",
  };
  let completedOutcome: AgentOutcome | undefined;
  const repository: ConversationRepository = {
    async findDuplicate() { return null; },
    async create() { throw new Error("not used"); },
    async findOwnedContext() {
      return { userId, context: createEmptyConversationContext() };
    },
    async saveContextAndMetadata() {},
    async append() { return "51000000-0000-4000-8000-000000000003"; },
    async finalizeTurn(_conversationId, _messageId, _message, outcome) {
      completedOutcome = outcome;
    },
  };
  const cart: CartModule = {
    async inspect() { return emptyCart; },
    async addItem() { throw new Error("not used"); },
    async addItems() { throw new Error("not used"); },
    async restoreItemRemoval() {
      throw new CartError("Undo expired after ten seconds.");
    },
  };
  const POST = createPostHandler(async () => ({
    cart,
    conversation: createConversationModule(userId, repository),
  }));

  const response = await POST(new Request("http://localhost/api/agent/cart-command", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      conversationId,
      idempotencyKey: "61000000-0000-4000-8000-000000000003",
      command: {
        type: "UNDO_CART_ITEM_REMOVAL",
        removalId: "61000000-0000-4000-8000-000000000001",
      },
    }),
  }));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(completedOutcome, payload.data);
  assert.equal(payload.data.status, "NEEDS_INPUT");
  assert.equal(payload.data.message, "Undo expired after ten seconds.");
  assert.deepEqual(payload.data.cart, emptyCart);
});

test("retrying a completed Undo returns its persisted result without restoring twice", async () => {
  const duplicateOutcome: AgentOutcome = {
    status: "COMPLETED",
    conversationId,
    message: "Restored Road Two to your Cart.",
    intentBrief: {
      goal: "Restore the recently removed Cart Item",
      constraints: createEmptyConversationContext().productConstraints,
      knownEntities: [],
      missingInformation: [],
      confidence: 1,
      requestedEffects: ["RESTORE_CART_ITEM"],
    },
    products: [],
    cart: {
      id: "31000000-0000-4000-8000-000000000001",
      items: [{
        productId,
        productName: "Road Two",
        quantity: 2,
        cartPriceMinor: 390000,
        subtotalMinor: 780000,
      }],
      totalQuantity: 2,
      subtotalMinor: 780000,
      currency: "INR",
    },
  };
  const repository: ConversationRepository = {
    async findDuplicate() { return duplicateOutcome; },
    async create() { throw new Error("must replay"); },
    async findOwnedContext() {
      return { userId, context: createEmptyConversationContext() };
    },
    async saveContextAndMetadata() { throw new Error("must replay"); },
    async append() { throw new Error("must replay"); },
  };
  const cart: CartModule = {
    async inspect() { return duplicateOutcome.cart!; },
    async addItem() { throw new Error("not used"); },
    async addItems() { throw new Error("not used"); },
    async restoreItemRemoval() { throw new Error("must not restore twice"); },
  };
  const POST = createPostHandler(async () => ({
    cart,
    conversation: createConversationModule(userId, repository),
  }));

  const response = await POST(new Request("http://localhost/api/agent/cart-command", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      conversationId,
      idempotencyKey: "61000000-0000-4000-8000-000000000004",
      command: {
        type: "UNDO_CART_ITEM_REMOVAL",
        removalId: "61000000-0000-4000-8000-000000000001",
      },
    }),
  }));

  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, duplicateOutcome);
});

test("structured relative quantity change persists the latest authoritative Cart result", async () => {
  const originalCart: CartView = {
    id: "31000000-0000-4000-8000-000000000001",
    items: [{
      productId,
      productName: "Road Two",
      quantity: 2,
      cartPriceMinor: 390000,
      subtotalMinor: 780000,
      availableQuantity: 8,
      productActive: true,
    }],
    totalQuantity: 2,
    subtotalMinor: 780000,
    currency: "INR",
  };
  const authoritativeCart: CartView = {
    ...originalCart,
    items: [{
      ...originalCart.items[0],
      quantity: 5,
      subtotalMinor: 2050000,
      cartPriceMinor: 410000,
    }],
    totalQuantity: 5,
    subtotalMinor: 2050000,
  };
  const changes: Array<{ productId?: string; mode: string; quantity: number }> = [];
  const transaction = {} as DbExecutor;
  const cart: CartModule = {
    async inspect() { return originalCart; },
    async addItem() { throw new Error("not used"); },
    async addItems() { throw new Error("not used"); },
    async applyMutations(mutations, complete) {
      const mutation = mutations[0];
      if (mutation.type !== "CHANGE_QUANTITY") throw new Error("wrong mutation");
      changes.push({ productId: mutation.productId, ...mutation.change });
      await complete(authoritativeCart, transaction);
      return authoritativeCart;
    },
  };
  const customerMessages: string[] = [];
  let completedOutcome: AgentOutcome | undefined;
  const repository: ConversationRepository = {
    async findDuplicate() { return null; },
    async create() { throw new Error("not used"); },
    async findOwnedContext() {
      return { userId, context: createEmptyConversationContext() };
    },
    async saveContextAndMetadata() {},
    async append(_conversationId, role, content) {
      if (role === "USER") customerMessages.push(content);
      return "51000000-0000-4000-8000-000000000001";
    },
    async finalizeTurn(_conversationId, _messageId, _message, outcome) {
      completedOutcome = outcome;
    },
  };
  const POST = createPostHandler(async () => ({
    cart,
    conversation: createConversationModule(userId, repository),
  }));

  const response = await POST(new Request("http://localhost/api/agent/cart-command", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      conversationId,
      idempotencyKey: "61000000-0000-4000-8000-000000000007",
      command: {
        type: "CHANGE_CART_ITEM_QUANTITY",
        productId,
        mode: "RELATIVE",
        quantity: 1,
      },
    }),
  }));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(changes, [{ productId, mode: "RELATIVE", quantity: 1 }]);
  assert.deepEqual(customerMessages, ["Increase Road Two quantity by 1"]);
  assert.deepEqual(completedOutcome, payload.data);
  assert.equal(payload.data.message, "Increased Road Two quantity to 5.");
  assert.deepEqual(payload.data.cart, authoritativeCart);
});

test("structured exact quantity change replaces the authoritative Cart quantity", async () => {
  const originalCart: CartView = {
    id: "31000000-0000-4000-8000-000000000001",
    items: [{
      productId,
      productName: "Road Two",
      quantity: 2,
      cartPriceMinor: 390000,
      subtotalMinor: 780000,
    }],
    totalQuantity: 2,
    subtotalMinor: 780000,
    currency: "INR",
  };
  const authoritativeCart: CartView = {
    ...originalCart,
    items: [{ ...originalCart.items[0], quantity: 4, subtotalMinor: 1560000 }],
    totalQuantity: 4,
    subtotalMinor: 1560000,
  };
  const applied: unknown[] = [];
  let completedOutcome: AgentOutcome | undefined;
  const repository: ConversationRepository = {
    async findDuplicate() { return null; },
    async create() { throw new Error("not used"); },
    async findOwnedContext() { return { userId, context: createEmptyConversationContext() }; },
    async saveContextAndMetadata() {},
    async append() { return "51000000-0000-4000-8000-000000000001"; },
    async finalizeTurn(_conversationId, _messageId, _message, outcome) { completedOutcome = outcome; },
  };
  const cart: CartModule = {
    async inspect() { return originalCart; },
    async addItem() { throw new Error("not used"); },
    async addItems() { throw new Error("not used"); },
    async applyMutations(mutations, complete) {
      applied.push(...mutations);
      await complete(authoritativeCart, {} as DbExecutor);
      return authoritativeCart;
    },
  };
  const POST = createPostHandler(async () => ({ cart, conversation: createConversationModule(userId, repository) }));

  const response = await POST(new Request("http://localhost/api/agent/cart-command", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      conversationId,
      idempotencyKey: "61000000-0000-4000-8000-000000000008",
      command: { type: "CHANGE_CART_ITEM_QUANTITY", productId, mode: "EXACT", quantity: 4 },
    }),
  }));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(applied, [{
    type: "CHANGE_QUANTITY",
    productId,
    change: { mode: "EXACT", quantity: 4 },
  }]);
  assert.deepEqual(completedOutcome, payload.data);
  assert.equal(payload.data.message, "Set Road Two quantity to 4.");
});

test("structured Clear Cart command persists one deterministic empty Cart turn", async () => {
  const originalCart: CartView = {
    id: "31000000-0000-4000-8000-000000000001",
    items: [{
      productId,
      productName: "Road Two",
      quantity: 2,
      cartPriceMinor: 390000,
      subtotalMinor: 780000,
    }],
    totalQuantity: 2,
    subtotalMinor: 780000,
    currency: "INR",
  };
  const emptyCart: CartView = {
    id: originalCart.id,
    items: [],
    totalQuantity: 0,
    subtotalMinor: 0,
    currency: "INR",
  };
  const customerMessages: string[] = [];
  const applied: unknown[] = [];
  let completedOutcome: AgentOutcome | undefined;
  const repository: ConversationRepository = {
    async findDuplicate() { return null; },
    async create() { throw new Error("not used"); },
    async findOwnedContext() { return { userId, context: createEmptyConversationContext() }; },
    async saveContextAndMetadata() {},
    async append(_conversationId, role, content) {
      if (role === "USER") customerMessages.push(content);
      return "51000000-0000-4000-8000-000000000001";
    },
    async finalizeTurn(_conversationId, _messageId, _message, outcome) { completedOutcome = outcome; },
  };
  const cart: CartModule = {
    async inspect() { return originalCart; },
    async addItem() { throw new Error("not used"); },
    async addItems() { throw new Error("not used"); },
    async applyMutations(mutations, complete) {
      applied.push(...mutations);
      await complete(emptyCart, {} as DbExecutor);
      return emptyCart;
    },
  };
  const POST = createPostHandler(async () => ({ cart, conversation: createConversationModule(userId, repository) }));

  const response = await POST(new Request("http://localhost/api/agent/cart-command", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      conversationId,
      idempotencyKey: "61000000-0000-4000-8000-000000000009",
      command: { type: "CLEAR_CART" },
    }),
  }));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(applied, [{ type: "CLEAR" }]);
  assert.deepEqual(customerMessages, ["Clear my Cart"]);
  assert.deepEqual(completedOutcome, payload.data);
  assert.equal(payload.data.message, "Cleared your Cart.");
  assert.deepEqual(payload.data.cart, emptyCart);
});

test("rejected quantity change persists its reason with refreshed authoritative Cart state", async () => {
  const cartView: CartView = {
    id: "31000000-0000-4000-8000-000000000001",
    items: [{
      productId,
      productName: "Road Two",
      quantity: 2,
      cartPriceMinor: 390000,
      subtotalMinor: 780000,
      availableQuantity: 2,
      productActive: true,
    }],
    totalQuantity: 2,
    subtotalMinor: 780000,
    currency: "INR",
  };
  let inspections = 0;
  let completedOutcome: AgentOutcome | undefined;
  const cart: CartModule = {
    async inspect() { inspections += 1; return cartView; },
    async addItem() { throw new Error("not used"); },
    async addItems() { throw new Error("not used"); },
    async applyMutations() { throw new CartError("Road Two only has 2 units in stock."); },
  };
  const repository: ConversationRepository = {
    async findDuplicate() { return null; },
    async create() { throw new Error("not used"); },
    async findOwnedContext() { return { userId, context: createEmptyConversationContext() }; },
    async saveContextAndMetadata() {},
    async append() { return "51000000-0000-4000-8000-000000000001"; },
    async finalizeTurn(_conversationId, _messageId, _message, outcome) { completedOutcome = outcome; },
  };
  const POST = createPostHandler(async () => ({ cart, conversation: createConversationModule(userId, repository) }));

  const response = await POST(new Request("http://localhost/api/agent/cart-command", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      conversationId,
      idempotencyKey: "61000000-0000-4000-8000-000000000010",
      command: { type: "CHANGE_CART_ITEM_QUANTITY", productId, mode: "RELATIVE", quantity: 1 },
    }),
  }));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(inspections, 2);
  assert.deepEqual(completedOutcome, payload.data);
  assert.equal(payload.data.status, "NEEDS_INPUT");
  assert.deepEqual(payload.data.cart, cartView);
  assert.deepEqual(payload.data.cartItemError, {
    productId,
    message: "Road Two only has 2 units in stock.",
  });
});

test("a rejected Cart Item Removal persists its reason with refreshed authoritative Cart state", async () => {
  const cartView: CartView = {
    id: "31000000-0000-4000-8000-000000000001",
    items: [{
      productId,
      productName: "Road Two",
      quantity: 1,
      cartPriceMinor: 390000,
      subtotalMinor: 390000,
    }],
    totalQuantity: 1,
    subtotalMinor: 390000,
    currency: "INR",
  };
  let inspections = 0;
  const cart: CartModule = {
    async inspect() { inspections += 1; return cartView; },
    async addItem() { throw new Error("not used"); },
    async addItems() { throw new Error("not used"); },
    async removeItem() { throw new Error("must remove by stable Product ID"); },
    async removeItemByProductId() {
      throw new CartError("Road Two could not be removed because the Cart changed. Please try again.");
    },
  };
  let completedOutcome: AgentOutcome | undefined;
  const repository: ConversationRepository = {
    async findDuplicate() { return null; },
    async create() { throw new Error("not used"); },
    async findOwnedContext() {
      return { userId, context: createEmptyConversationContext() };
    },
    async saveContextAndMetadata() {},
    async append() { return "51000000-0000-4000-8000-000000000001"; },
    async finalizeTurn(_conversationId, _messageId, _message, outcome) {
      completedOutcome = outcome;
    },
  };
  const POST = createPostHandler(async () => ({
    cart,
    conversation: createConversationModule(userId, repository),
  }));

  const response = await POST(new Request("http://localhost/api/agent/cart-command", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      conversationId,
      idempotencyKey: "61000000-0000-4000-8000-000000000002",
      command: { type: "REMOVE_CART_ITEM", productId },
    }),
  }));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(inspections, 2);
  assert.deepEqual(completedOutcome, payload.data);
  assert.equal(payload.data.status, "NEEDS_INPUT");
  assert.deepEqual(payload.data.cart, cartView);
  assert.deepEqual(payload.data.cartItemError, {
    productId,
    message: "Road Two could not be removed because the Cart changed. Please try again.",
  });
});

test("retrying a completed Cart Item Removal returns its persisted outcome without mutating again", async () => {
  const duplicateOutcome: AgentOutcome = {
    status: "COMPLETED",
    conversationId,
    message: "Removed Road Two from your Cart.",
    intentBrief: {
      goal: "Remove Road Two from the Cart",
      constraints: createEmptyConversationContext().productConstraints,
      knownEntities: [],
      missingInformation: [],
      confidence: 1,
      requestedEffects: ["REMOVE_FROM_CART"],
    },
    products: [],
    cart: {
      id: "31000000-0000-4000-8000-000000000001",
      items: [],
      totalQuantity: 0,
      subtotalMinor: 0,
      currency: "INR",
    },
  };
  const repository: ConversationRepository = {
    async findDuplicate() { return duplicateOutcome; },
    async create() { throw new Error("must replay"); },
    async findOwnedContext() { throw new Error("must replay"); },
    async saveContextAndMetadata() { throw new Error("must replay"); },
    async append() { throw new Error("must replay"); },
  };
  const cart: CartModule = {
    async inspect() { return duplicateOutcome.cart!; },
    async addItem() { throw new Error("not used"); },
    async addItems() { throw new Error("not used"); },
    async removeItemByProductId() { throw new Error("must not mutate twice"); },
  };
  const POST = createPostHandler(async () => ({
    cart,
    conversation: createConversationModule(userId, repository),
  }));

  const response = await POST(new Request("http://localhost/api/agent/cart-command", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      conversationId,
      idempotencyKey: "61000000-0000-4000-8000-000000000003",
      command: { type: "REMOVE_CART_ITEM", productId },
    }),
  }));

  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, duplicateOutcome);
});

test("rejects a malformed Cart command before resolving commerce modules", async () => {
  let factoryCalls = 0;
  const POST = createPostHandler(async () => {
    factoryCalls += 1;
    throw new Error("must not resolve modules");
  });

  const response = await POST(new Request("http://localhost/api/agent/cart-command", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      conversationId,
      idempotencyKey: "61000000-0000-4000-8000-000000000004",
      command: { type: "REMOVE_CART_ITEM", productId: "not-a-product-id" },
    }),
  }));

  assert.equal(response.status, 400);
  assert.equal(factoryCalls, 0);
  assert.deepEqual(await response.json(), {
    error: {
      code: "INVALID_CART_COMMAND",
      message: "command must identify one Cart Item to remove.",
      details: {},
    },
  });
});

test("rejects a Cart command for a Conversation outside the current User's ownership", async () => {
  const repository: ConversationRepository = {
    async findDuplicate() { return null; },
    async create() { throw new Error("not used"); },
    async findOwnedContext() { return null; },
    async saveContextAndMetadata() {},
    async append() { throw new Error("must not append"); },
  };
  const cart: CartModule = {
    async inspect() {
      return {
        id: null,
        items: [],
        totalQuantity: 0,
        subtotalMinor: 0,
        currency: "INR",
      };
    },
    async addItem() { throw new Error("not used"); },
    async addItems() { throw new Error("not used"); },
  };
  const POST = createPostHandler(async () => ({
    cart,
    conversation: createConversationModule(userId, repository),
  }));

  const response = await POST(new Request("http://localhost/api/agent/cart-command", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      conversationId,
      idempotencyKey: "61000000-0000-4000-8000-000000000005",
      command: { type: "REMOVE_CART_ITEM", productId },
    }),
  }));

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    error: {
      code: "CONVERSATION_NOT_FOUND",
      message: "The conversation was not found.",
      details: {},
    },
  });
});

test("returns a bounded error when Cart command infrastructure fails", async (t) => {
  t.mock.method(console, "error", () => undefined);
  const POST = createPostHandler(async () => {
    throw new Error("database credentials must not escape");
  });

  const response = await POST(new Request("http://localhost/api/agent/cart-command", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      conversationId,
      idempotencyKey: "61000000-0000-4000-8000-000000000006",
      command: { type: "REMOVE_CART_ITEM", productId },
    }),
  }));

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred.",
      details: {},
    },
  });
});
