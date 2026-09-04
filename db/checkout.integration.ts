import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after, before } from "node:test";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents } from "@/db/schema/audit";
import {
  checkoutApprovals,
  checkoutProposals,
  orderItems,
  orders,
  paymentAttempts,
  providerNotifications,
  providerOperations,
  providerOrders,
  providerPayments,
} from "@/db/schema/checkout";
import { cartItems, carts } from "@/db/schema/cart";
import { products } from "@/db/schema/catalog";
import { guestSessions } from "@/db/schema/identity";
import { createCartModule } from "@/modules/cart/cart";
import type { CatalogProduct } from "@/modules/catalog/catalog";
import { confirmOrderPaid } from "@/modules/checkout/order-payment";
import { createCheckoutAuditLog } from "@/modules/checkout/checkout-audit";
import {
  createCheckoutOrderStore,
  createCheckoutProposalStore,
} from "@/modules/checkout/checkout-store";
import type { CheckoutProposal } from "@/modules/checkout/checkout-proposal";
import {
  createProviderNotificationInbox,
  heldNotificationCount,
} from "@/modules/checkout/provider-notification-inbox";
import { cleanupExpiredGuestSessions } from "@/modules/identity/guest-session";

/**
 * Proves the promises only Postgres can keep: that Approval consumption is
 * atomic, that one Checkout Proposal can produce exactly one Order however
 * many times it is submitted, that one Order has exactly one Provider Order,
 * that Razorpay's event IDs deduplicate durably, and that protected commerce
 * evidence survives the Guest Session that created it.
 *
 * It runs against a real database and is invoked separately from the ordinary
 * suite, which stays hermetic and credential-free.
 */

const GUEST_SESSION_ID = "14000000-0000-4000-8000-000000000001";
const CART_ID = "34000000-0000-4000-8000-000000000001";
let productId: string;
let product: CatalogProduct;

/**
 * Every Razorpay Payment and event identifier this suite invents.
 *
 * Provider Payments and Provider Notifications carry no Guest Session, so
 * nothing about a row says which run created it. Naming the identifiers here
 * is what keeps cleanup to this suite's own rows: the project now points at a
 * shared hosted database, where an unscoped delete would take evidence
 * belonging to other work with it.
 */
const OWN_PROVIDER_PAYMENT_IDS = [
  "pay_TEST_MONOTONIC",
  "pay_TEST_DEDUPE",
  "pay_TEST_EARLY",
  "pay_TEST_RACED",
];
const OWN_NOTIFICATION_EVENT_IDS = [
  "evt_TEST_DEDUPE",
  "evt_TEST_EARLY",
  "evt_TEST_EARLY_FOLLOWUP",
  "evt_TEST_RACED",
  "evt_TEST_LATE_ARRIVAL",
];

const orderStore = createCheckoutOrderStore(db);
const proposalStore = createCheckoutProposalStore(GUEST_SESSION_ID, db);
const audit = createCheckoutAuditLog(db);

function proposalFor(overrides: Partial<CheckoutProposal> = {}): CheckoutProposal {
  return {
    id: randomUUID(),
    cartId: CART_ID,
    cartVersion: 4,
    currency: "INR",
    lines: [
      {
        productId,
        productName: "Integration Product",
        quantity: 2,
        cartPriceMinor: 349900,
        lineTotalMinor: 699800,
      },
    ],
    itemsSubtotalMinor: 699800,
    discountMinor: 0,
    shippingMinor: 0,
    taxMinor: 0,
    checkoutTotalMinor: 699800,
    policy: {
      result: "REQUIRE_APPROVAL",
      reasonCode: "PAYMENT_REQUIRES_CUSTOMER_APPROVAL",
      explanation: "Payment always needs your explicit approval.",
    },
    status: "ACTIVE",
    preparedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    ...overrides,
  };
}

async function saveProposal(
  overrides: Partial<CheckoutProposal> = {},
): Promise<CheckoutProposal> {
  const proposal = proposalFor(overrides);
  await proposalStore.save(proposal, randomUUID());
  return proposal;
}

/** Gives this Guest Session an active Cart holding one Product. */
async function saveActiveCart() {
  const [cart] = await db
    .insert(carts)
    .values({ guestSessionId: GUEST_SESSION_ID, currency: "INR" })
    .returning({ id: carts.id, version: carts.version });
  await db.insert(cartItems).values({
    cartId: cart.id,
    productId,
    quantity: 2,
    unitPriceSnapshotMinor: 349900,
  });
  return cart;
}

async function readCartStatus(cartId: string) {
  const [row] = await db
    .select({ status: carts.status })
    .from(carts)
    .where(eq(carts.id, cartId));
  return row?.status;
}

async function readOrderStatus(orderId: string) {
  const [row] = await db
    .select({ status: orders.status })
    .from(orders)
    .where(eq(orders.id, orderId));
  return row?.status;
}

/** Confirms a capture through the one path both production callers use. */
function confirmCapture(order: {
  id: string;
  cartId: string;
  proposalId: string;
}) {
  return confirmOrderPaid({
    orders: orderStore,
    audit,
    order: { ...order, guestSessionId: GUEST_SESSION_ID },
    occurredAt: new Date(),
  });
}

function consume(proposal: CheckoutProposal, approvalKey = randomUUID()) {
  return orderStore.consumeApproval({
    proposal,
    approvalKey,
    approvedTotalMinor: proposal.checkoutTotalMinor,
    guestSessionId: GUEST_SESSION_ID,
    now: new Date(),
    revalidate: async () => null,
    onCreated: async ({ order }, transaction) => {
      await audit.record(
        {
          entityType: "Order",
          entityId: order.id,
          correlationId: proposal.id,
          actorType: "CUSTOMER",
          eventType: "ORDER_CREATED",
          reasonCode: "ORDER_CREATED_FROM_APPROVAL",
          message: "An Order was created from the approved proposal.",
          amountMinor: order.totalMinor,
          currency: order.currency,
          guestSessionId: GUEST_SESSION_ID,
          customerVisible: true,
        },
        transaction,
      );
    },
  });
}

async function clearCheckoutData() {
  const ownOrders = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.guestSessionId, GUEST_SESSION_ID));
  const orderIds = ownOrders.map((order) => order.id);
  if (orderIds.length > 0) {
    await db.delete(providerOrders).where(inArray(providerOrders.orderId, orderIds));
    await db.delete(paymentAttempts).where(inArray(paymentAttempts.orderId, orderIds));
    await db
      .delete(providerOperations)
      .where(inArray(providerOperations.orderId, orderIds));
    await db.delete(orderItems).where(inArray(orderItems.orderId, orderIds));
    await db.delete(orders).where(inArray(orders.id, orderIds));
  }
  // Provider Payments outlive the Order they belong to and one case records a
  // payment with no Order at all, so they are cleared by their own identifiers
  // rather than through the Orders this run happens to have left behind.
  await db
    .delete(providerPayments)
    .where(inArray(providerPayments.providerPaymentId, OWN_PROVIDER_PAYMENT_IDS));
  await db
    .delete(providerNotifications)
    .where(inArray(providerNotifications.eventId, OWN_NOTIFICATION_EVENT_IDS));
  // A Provider Notification that never found its Provider Order carries no
  // Guest Session, so the scoped delete below cannot reach its audit evidence.
  // It is cleared alongside the notifications it describes; left behind, it
  // accumulates in a durable database and the next run reads this run's
  // history as its own.
  await db
    .delete(auditEvents)
    .where(
      and(
        eq(auditEvents.entityType, "ProviderNotification"),
        inArray(auditEvents.entityId, OWN_NOTIFICATION_EVENT_IDS),
      ),
    );
  await db
    .delete(auditEvents)
    .where(eq(auditEvents.guestSessionId, GUEST_SESSION_ID));
  await db
    .delete(checkoutApprovals)
    .where(eq(checkoutApprovals.guestSessionId, GUEST_SESSION_ID));
  await db
    .delete(checkoutProposals)
    .where(eq(checkoutProposals.guestSessionId, GUEST_SESSION_ID));
  // Cart Items cascade with the Cart that holds them.
  await db.delete(carts).where(eq(carts.guestSessionId, GUEST_SESSION_ID));
}

before(async () => {
  await clearCheckoutData();
  await db
    .delete(guestSessions)
    .where(eq(guestSessions.id, GUEST_SESSION_ID));
  await db.insert(guestSessions).values({
    id: GUEST_SESSION_ID,
    tokenHash: `integration-${GUEST_SESSION_ID}`,
    expiresAt: new Date(Date.now() + 3_600_000),
  });

  const [existing] = await db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      description: products.description,
      category: products.category,
      priceMinor: products.priceMinor,
      currency: products.currency,
    })
    .from(products)
    .limit(1);
  const row =
    existing ??
    (
      await db
        .insert(products)
        .values({
          name: "Integration Product",
          slug: `integration-product-${randomUUID()}`,
          description:
            "A Product that exists so Order Items have something to cite.",
          category: "integration",
          priceMinor: 349900,
          currency: "INR",
          stock: 10,
        })
        .returning({
          id: products.id,
          slug: products.slug,
          name: products.name,
          description: products.description,
          category: products.category,
          priceMinor: products.priceMinor,
          currency: products.currency,
        })
    )[0];
  productId = row.id;
  product = { ...row, inStock: true, attributes: {} };
});

after(async () => {
  await clearCheckoutData();
  await db.delete(guestSessions).where(eq(guestSessions.id, GUEST_SESSION_ID));
});

test("consuming one Approval creates the Order, its Items, and one Operation atomically", async (t) => {
  const proposal = await saveProposal();
  t.after(clearCheckoutData);

  const outcome = await consume(proposal);

  if (outcome.status === "REFUSED") assert.fail(outcome.reason);
  assert.equal(outcome.status, "CREATED");
  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, outcome.order.id));
  assert.equal(items.length, 1);
  assert.equal(items[0].lineTotalMinor, 699800);
  const [stored] = await db
    .select({ status: checkoutProposals.status })
    .from(checkoutProposals)
    .where(eq(checkoutProposals.id, proposal.id));
  assert.equal(stored.status, "CONSUMED");
  const [approval] = await db
    .select()
    .from(checkoutApprovals)
    .where(eq(checkoutApprovals.proposalId, proposal.id));
  assert.ok(approval.consumedAt);
});

test("a refused revalidation leaves no Order, Approval, or consumed proposal", async (t) => {
  const proposal = await saveProposal();
  t.after(clearCheckoutData);

  const outcome = await orderStore.consumeApproval({
    proposal,
    approvalKey: randomUUID(),
    approvedTotalMinor: proposal.checkoutTotalMinor,
    guestSessionId: GUEST_SESSION_ID,
    now: new Date(),
    revalidate: async () => "Your Cart changed after this proposal.",
    onCreated: async () => {},
  });

  assert.equal(outcome.status, "REFUSED");
  const created = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.proposalId, proposal.id));
  assert.deepEqual(created, []);
  const [stored] = await db
    .select({ status: checkoutProposals.status })
    .from(checkoutProposals)
    .where(eq(checkoutProposals.id, proposal.id));
  assert.equal(stored.status, "ACTIVE");
});

test("concurrent double-submitted Approvals resolve to one Order", async (t) => {
  const proposal = await saveProposal();
  t.after(clearCheckoutData);

  const outcomes = await Promise.all([
    consume(proposal),
    consume(proposal),
    consume(proposal),
  ]);

  const orderIds = new Set(
    outcomes.flatMap((outcome) =>
      outcome.status === "REFUSED" ? [] : [outcome.order.id],
    ),
  );
  assert.equal(orderIds.size, 1);
  const stored = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.proposalId, proposal.id));
  assert.equal(stored.length, 1);
  const operations = await db
    .select({ id: providerOperations.id })
    .from(providerOperations)
    .where(eq(providerOperations.orderId, [...orderIds][0]));
  assert.equal(operations.length, 1);
});

test("one Order can hold only one Provider Order", async (t) => {
  const proposal = await saveProposal();
  t.after(clearCheckoutData);
  const outcome = await consume(proposal);
  if (outcome.status === "REFUSED") assert.fail(outcome.reason);

  const attach = (providerOrderId: string, receipt: string) =>
    orderStore.attachProviderOrder({
      orderId: outcome.order.id,
      operationId: outcome.operation.id,
      providerOrder: {
        providerOrderId,
        receipt,
        amountMinor: 699800,
        currency: "INR",
        providerStatus: "created",
      },
      notes: { orderId: outcome.order.id },
    });

  await attach("order_TEST_A", outcome.operation.id);
  await attach("order_TEST_B", randomUUID());

  const attached = await db
    .select({ providerOrderId: providerOrders.providerOrderId })
    .from(providerOrders)
    .where(eq(providerOrders.orderId, outcome.order.id));
  assert.deepEqual(attached, [{ providerOrderId: "order_TEST_A" }]);
});

test("Payment Attempts beyond the third are refused by the database", async (t) => {
  const proposal = await saveProposal();
  t.after(clearCheckoutData);
  const outcome = await consume(proposal);
  if (outcome.status === "REFUSED") assert.fail(outcome.reason);

  for (let attemptNumber = 1; attemptNumber <= 3; attemptNumber += 1) {
    const attempt = await orderStore.openPaymentAttempt({
      orderId: outcome.order.id,
      providerOrderId: "order_TEST_A",
      attemptNumber,
    });
    assert.ok(attempt);
  }
  await assert.rejects(() =>
    orderStore.openPaymentAttempt({
      orderId: outcome.order.id,
      providerOrderId: "order_TEST_A",
      attemptNumber: 4,
    }),
  );
  assert.equal(await orderStore.countPaymentAttempts(outcome.order.id), 3);
});

test("a captured Provider Payment is never regressed by later stale evidence", async (t) => {
  t.after(clearCheckoutData);
  const record = (providerStatus: string, captured: boolean) =>
    orderStore.recordProviderPayment({
      providerPaymentId: "pay_TEST_MONOTONIC",
      providerOrderId: "order_TEST_A",
      paymentAttemptId: null,
      providerStatus,
      captured,
      amountMinor: 699800,
      currency: "INR",
    });

  await record("captured", true);
  await record("failed", false);

  const [payment] = await db
    .select()
    .from(providerPayments)
    .where(eq(providerPayments.providerPaymentId, "pay_TEST_MONOTONIC"));
  assert.equal(payment.captured, true);
  assert.equal(payment.providerStatus, "captured");
});

test("a repeated Razorpay event ID is recognized rather than applied twice", async (t) => {
  t.after(clearCheckoutData);
  const inbox = createProviderNotificationInbox({
    database: db,
    orders: orderStore,
    audit,
  });
  const facts = {
    eventId: "evt_TEST_DEDUPE",
    eventType: "payment.captured",
    providerOrderId: "order_TEST_UNKNOWN",
    providerPaymentId: "pay_TEST_DEDUPE",
    providerStatus: "captured",
    amountMinor: 699800,
    currency: "INR",
    occurredAt: new Date(),
  };

  const first = await inbox.receive(facts);
  const second = await inbox.receive(facts);

  assert.equal(first.status, "HELD");
  assert.equal(second.status, "DUPLICATE");
  const stored = await db
    .select({ id: providerNotifications.id })
    .from(providerNotifications)
    .where(eq(providerNotifications.eventId, "evt_TEST_DEDUPE"));
  assert.equal(stored.length, 1);

  // Retention and deduplication are what a Brand operator must be able to
  // explain later, so each leaves its own operational evidence behind.
  const recorded = await db
    .select({
      eventType: auditEvents.eventType,
      customerVisible: auditEvents.customerVisible,
      correlationId: auditEvents.correlationId,
    })
    .from(auditEvents)
    .where(eq(auditEvents.entityId, "evt_TEST_DEDUPE"))
    .orderBy(auditEvents.occurredAt, auditEvents.createdAt);
  assert.deepEqual(
    recorded.map((event) => event.eventType),
    ["PROVIDER_NOTIFICATION_HELD", "PROVIDER_NOTIFICATION_DUPLICATE"],
  );
  assert.deepEqual(
    recorded.map((event) => event.customerVisible),
    [false, false],
  );
  assert.deepEqual(
    recorded.map((event) => event.correlationId),
    [null, null],
  );
});

test("an early notification is applied once its Provider Order becomes known", async (t) => {
  const proposal = await saveProposal();
  t.after(clearCheckoutData);
  const outcome = await consume(proposal);
  if (outcome.status === "REFUSED") assert.fail(outcome.reason);
  const inbox = createProviderNotificationInbox({
    database: db,
    orders: orderStore,
    audit,
  });
  const early = {
    eventId: "evt_TEST_EARLY",
    eventType: "payment.captured",
    providerOrderId: "order_TEST_EARLY",
    providerPaymentId: "pay_TEST_EARLY",
    providerStatus: "captured",
    amountMinor: 699800,
    currency: "INR",
    occurredAt: new Date(),
  };

  assert.equal((await inbox.receive(early)).status, "HELD");
  await orderStore.attachProviderOrder({
    orderId: outcome.order.id,
    operationId: outcome.operation.id,
    providerOrder: {
      providerOrderId: "order_TEST_EARLY",
      receipt: outcome.operation.id,
      amountMinor: 699800,
      currency: "INR",
      providerStatus: "created",
    },
    notes: {},
  });
  await inbox.receive({ ...early, eventId: "evt_TEST_EARLY_FOLLOWUP" });

  const [order] = await db
    .select({ status: orders.status })
    .from(orders)
    .where(eq(orders.id, outcome.order.id));
  assert.equal(order.status, "PAID");
  const [held] = await db
    .select({ appliedAt: providerNotifications.appliedAt })
    .from(providerNotifications)
    .where(eq(providerNotifications.eventId, "evt_TEST_EARLY"));
  assert.ok(held.appliedAt);
});

test("held evidence is applied the moment its Provider Order is attached", async (t) => {
  const proposal = await saveProposal();
  t.after(clearCheckoutData);
  const outcome = await consume(proposal);
  if (outcome.status === "REFUSED") assert.fail(outcome.reason);
  const inbox = createProviderNotificationInbox({
    database: db,
    orders: orderStore,
    audit,
  });

  assert.equal(
    (
      await inbox.receive({
        eventId: "evt_TEST_RACED",
        eventType: "payment.captured",
        providerOrderId: "order_TEST_RACED",
        providerPaymentId: "pay_TEST_RACED",
        providerStatus: "captured",
        amountMinor: 699800,
        currency: "INR",
        occurredAt: new Date(),
      })
    ).status,
    "HELD",
  );
  await orderStore.attachProviderOrder({
    orderId: outcome.order.id,
    operationId: outcome.operation.id,
    providerOrder: {
      providerOrderId: "order_TEST_RACED",
      receipt: outcome.operation.id,
      amountMinor: 699800,
      currency: "INR",
      providerStatus: "created",
    },
    notes: {},
  });

  // No second delivery arrives: association alone must release the evidence.
  assert.equal(await inbox.releaseHeldFor("order_TEST_RACED"), 1);

  const [order] = await db
    .select({ status: orders.status })
    .from(orders)
    .where(eq(orders.id, outcome.order.id));
  assert.equal(order.status, "PAID");
  assert.equal(await heldNotificationCount(db), 0);
  // Releasing twice must not apply the same evidence again.
  assert.equal(await inbox.releaseHeldFor("order_TEST_RACED"), 0);

  // A capture confirmed only asynchronously must still end the Customer's
  // timeline with their Order being paid, exactly as the callback path does.
  const timeline = await orderStore.readTimeline(outcome.order.proposalId);
  assert.deepEqual(
    timeline
      .map((entry) => entry.eventType)
      .filter((eventType) => eventType !== "ORDER_CREATED"),
    ["PROVIDER_NOTIFICATION_RECEIVED", "ORDER_PAID"],
  );
});

test("protected commerce evidence survives the Guest Session that created it", async (t) => {
  const proposal = await saveProposal();
  t.after(clearCheckoutData);
  const outcome = await consume(proposal);
  if (outcome.status === "REFUSED") assert.fail(outcome.reason);
  await db
    .update(guestSessions)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(guestSessions.id, GUEST_SESSION_ID));

  await cleanupExpiredGuestSessions(db, new Date());

  const [session] = await db
    .select({ id: guestSessions.id })
    .from(guestSessions)
    .where(eq(guestSessions.id, GUEST_SESSION_ID));
  assert.equal(session, undefined);
  const survivingOrders = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.id, outcome.order.id));
  assert.equal(survivingOrders.length, 1);
  const survivingOperations = await db
    .select({ id: providerOperations.id })
    .from(providerOperations)
    .where(eq(providerOperations.orderId, outcome.order.id));
  assert.equal(survivingOperations.length, 1);
  const survivingAudit = await db
    .select({ id: auditEvents.id })
    .from(auditEvents)
    .where(eq(auditEvents.correlationId, proposal.id));
  assert.ok(survivingAudit.length > 0);

  // The guest-owned half is gone with the credential, exactly as intended.
  const survivingProposals = await db
    .select({ id: checkoutProposals.id })
    .from(checkoutProposals)
    .where(eq(checkoutProposals.id, proposal.id));
  assert.deepEqual(survivingProposals, []);

  await db.insert(guestSessions).values({
    id: GUEST_SESSION_ID,
    tokenHash: `integration-${GUEST_SESSION_ID}`,
    expiresAt: new Date(Date.now() + 3_600_000),
  });
});

test("Audit Events are readable in the order they were recorded, and only when visible", async (t) => {
  const proposal = await saveProposal();
  t.after(clearCheckoutData);
  const outcome = await consume(proposal);
  if (outcome.status === "REFUSED") assert.fail(outcome.reason);
  await audit.record({
    entityType: "ProviderOperation",
    entityId: outcome.operation.id,
    correlationId: proposal.id,
    actorType: "SYSTEM",
    eventType: "PROVIDER_ORDER_REQUESTED",
    reasonCode: "PROVIDER_OPERATION_READY",
    message: "An operational event a Customer never sees.",
    guestSessionId: GUEST_SESSION_ID,
    customerVisible: false,
    occurredAt: new Date(Date.now() + 1000),
  });
  // Evidence Razorpay timestamped before the Order existed. It is learned last
  // and must be told last, or a Customer would read the capture above the
  // payment that was captured.
  await audit.record({
    entityType: "ProviderNotification",
    entityId: "evt_TEST_LATE_ARRIVAL",
    correlationId: proposal.id,
    actorType: "RAZORPAY",
    eventType: "PROVIDER_NOTIFICATION_RECEIVED",
    reasonCode: "payment.captured",
    message: "Razorpay confirmed that this test payment was captured.",
    guestSessionId: GUEST_SESSION_ID,
    customerVisible: true,
    occurredAt: new Date(Date.now() - 3_600_000),
  });

  const timeline = await orderStore.readTimeline(proposal.id);

  assert.deepEqual(
    timeline.map((entry) => entry.eventType),
    ["ORDER_CREATED", "PROVIDER_NOTIFICATION_RECEIVED"],
  );
  const everything = await db
    .select({ id: auditEvents.id })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.correlationId, proposal.id),
        eq(auditEvents.environmentMode, "TEST"),
      ),
    );
  assert.equal(everything.length, 3);
});

test("a confirmed capture leaves the Order paid and its Cart converted in one commit", async (t) => {
  const cart = await saveActiveCart();
  const proposal = await saveProposal({ cartId: cart.id });
  t.after(clearCheckoutData);
  const outcome = await consume(proposal);
  if (outcome.status === "REFUSED") assert.fail(outcome.reason);

  await confirmCapture(outcome.order);

  assert.equal(await readOrderStatus(outcome.order.id), "PAID");
  assert.equal(await readCartStatus(cart.id), "CONVERTED");
});

test("the Customer's next Cart read after a confirmed capture is empty, and selecting again starts a fresh Cart", async (t) => {
  const cart = await saveActiveCart();
  const proposal = await saveProposal({ cartId: cart.id });
  t.after(clearCheckoutData);
  const outcome = await consume(proposal);
  if (outcome.status === "REFUSED") assert.fail(outcome.reason);
  const cartModule = createCartModule(GUEST_SESSION_ID);

  await confirmCapture(outcome.order);

  const afterPaying = await cartModule.inspect();
  assert.deepEqual(afterPaying.items, []);
  assert.equal(afterPaying.totalQuantity, 0);

  const restarted = await cartModule.addItem(product, 1, async () => {});
  assert.equal(restarted.totalQuantity, 1);
  assert.notEqual(restarted.id, cart.id);
  // The paid Cart is kept as history rather than deleted.
  assert.equal(await readCartStatus(cart.id), "CONVERTED");
});

test("an Order that exhausted its Payment Attempts leaves its Cart active with its Items", async (t) => {
  const cart = await saveActiveCart();
  const proposal = await saveProposal({ cartId: cart.id });
  t.after(clearCheckoutData);
  const outcome = await consume(proposal);
  if (outcome.status === "REFUSED") assert.fail(outcome.reason);

  await orderStore.setOrderStatus(outcome.order.id, "PAYMENT_FAILED");

  assert.equal(await readCartStatus(cart.id), "ACTIVE");
  const stillSelected = await createCartModule(GUEST_SESSION_ID).inspect();
  assert.equal(stillSelected.id, cart.id);
  assert.equal(stillSelected.totalQuantity, 2);
});

test("a capture confirmed by a Provider Notification converts the Cart just as a browser callback would", async (t) => {
  const cart = await saveActiveCart();
  const proposal = await saveProposal({ cartId: cart.id });
  t.after(clearCheckoutData);
  const outcome = await consume(proposal);
  if (outcome.status === "REFUSED") assert.fail(outcome.reason);
  const inbox = createProviderNotificationInbox({
    database: db,
    orders: orderStore,
    audit,
  });
  await orderStore.attachProviderOrder({
    orderId: outcome.order.id,
    operationId: outcome.operation.id,
    providerOrder: {
      providerOrderId: "order_TEST_RACED",
      receipt: outcome.operation.id,
      amountMinor: 699800,
      currency: "INR",
      providerStatus: "created",
    },
    notes: {},
  });

  await inbox.receive({
    eventId: "evt_TEST_RACED",
    eventType: "payment.captured",
    providerOrderId: "order_TEST_RACED",
    providerPaymentId: "pay_TEST_RACED",
    providerStatus: "captured",
    amountMinor: 699800,
    currency: "INR",
    occurredAt: new Date(),
  });

  assert.equal(await readOrderStatus(outcome.order.id), "PAID");
  assert.equal(await readCartStatus(cart.id), "CONVERTED");
  // The conversion is explained where the rest of the checkout is explained.
  const timeline = await orderStore.readTimeline(proposal.id);
  assert.ok(timeline.some((entry) => entry.eventType === "CART_CONVERTED"));
});

test("a second confirmation of the same capture converts nothing twice and never reaches the next Cart", async (t) => {
  const cart = await saveActiveCart();
  const proposal = await saveProposal({ cartId: cart.id });
  t.after(clearCheckoutData);
  const outcome = await consume(proposal);
  if (outcome.status === "REFUSED") assert.fail(outcome.reason);
  const cartModule = createCartModule(GUEST_SESSION_ID);

  await confirmCapture(outcome.order);
  const nextCart = await cartModule.addItem(product, 1, async () => {});
  await confirmCapture(outcome.order);

  const conversions = await db
    .select({ id: auditEvents.id })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.entityId, cart.id),
        eq(auditEvents.eventType, "CART_CONVERTED"),
      ),
    );
  assert.equal(conversions.length, 1);
  assert.equal(await readCartStatus(nextCart.id!), "ACTIVE");
});
