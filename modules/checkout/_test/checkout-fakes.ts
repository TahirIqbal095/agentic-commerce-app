/**
 * In-memory stand-ins for the checkout authority's durable stores and its
 * payment provider.
 *
 * They are contract-faithful rather than convenient: the fake Order store
 * enforces the same one-Order-per-proposal and one-Provider-Order-per-Order
 * uniqueness the database does, and the fake gateway distinguishes a lost
 * response from a refusal exactly as the real adapter must. A rule that passes
 * here because the fake was lenient would be a rule that does not exist.
 */

import type { CartWithProductAvailability } from "@/modules/cart/cart-view";
import type { CartReviewRead } from "@/modules/cart/cart-inspection";
import type { RazorpayTestConfiguration } from "@/modules/payments/razorpay-config";
import type {
  CreateProviderOrderInput,
  ProviderReadOutcome,
  ProviderWriteOutcome,
  RazorpayProviderGateway,
} from "@/modules/payments/razorpay-gateway";
import type {
  ProviderOrderResult,
  ProviderPaymentResult,
} from "@/modules/payments/razorpay-tools";
import type { CheckoutAuditEvent, CheckoutAuditLog } from "../checkout-audit";
import type { CheckoutProposal } from "../checkout-proposal";
import type {
  CheckoutOrderStore,
  CheckoutProposalStore,
  StoredOrder,
  StoredProviderOperation,
  StoredProviderOrder,
} from "../checkout-store";
import type { HeldNotificationRelease } from "../provider-notification-inbox";
import type { CheckoutAuditRecord } from "../checkout-timeline";
import type { OrderStatus, PaymentAttemptStatus } from "../checkout-status";

export const GUEST_SESSION_ID = "21000000-0000-4000-8000-000000000001";
export const CART_ID = "31000000-0000-4000-8000-000000000001";

export function reviewableCart(
  overrides: Partial<CartWithProductAvailability> = {},
): CartWithProductAvailability {
  return {
    id: CART_ID,
    version: 4,
    currency: "INR",
    totalQuantity: 3,
    subtotalMinor: 1599700,
    items: [
      {
        productId: "11000000-0000-4000-8000-000000000001",
        productName: "Quiet Buds",
        quantity: 2,
        cartPriceMinor: 349900,
        subtotalMinor: 699800,
        isAvailable: true,
        stock: 5,
      },
      {
        productId: "11000000-0000-4000-8000-000000000002",
        productName: "Trail Runner",
        quantity: 1,
        cartPriceMinor: 899900,
        subtotalMinor: 899900,
        isAvailable: true,
        stock: 2,
      },
    ],
    ...overrides,
  };
}

export function fakeCartReview(
  read: () => CartWithProductAvailability,
): CartReviewRead {
  return { readCartForReview: async () => read() };
}

export function fakeAuditLog() {
  const events: CheckoutAuditEvent[] = [];
  const log: CheckoutAuditLog = {
    async record(event) {
      events.push(event);
    },
  };
  return { events, log };
}

/**
 * A stand-in for the durable Provider Notification inbox.
 *
 * It records which Provider Order the authority asked it to associate, so a
 * test can prove that evidence delivered before that Provider Order existed is
 * released at the moment it does — and that a broken inbox never rolls back a
 * Provider Order the Storefront already verified.
 */
export function fakeNotificationInbox() {
  const released: string[] = [];
  let failure: Error | null = null;
  const inbox: HeldNotificationRelease = {
    async releaseHeldFor(providerOrderId) {
      released.push(providerOrderId);
      if (failure) throw failure;
      return 0;
    },
  };
  return {
    released,
    inbox,
    failWith(error: Error) {
      failure = error;
    },
  };
}

export function fakeProposalStore(): CheckoutProposalStore & {
  proposals: Map<string, CheckoutProposal>;
} {
  const proposals = new Map<string, CheckoutProposal>();
  const commandKeys = new Map<string, string>();

  return {
    proposals,
    async findByCommandKey(commandKey) {
      const id = commandKeys.get(commandKey);
      return id ? (proposals.get(id) ?? null) : null;
    },
    async save(proposal, commandKey) {
      proposals.set(proposal.id, proposal);
      commandKeys.set(commandKey, proposal.id);
    },
    async findById(proposalId) {
      return proposals.get(proposalId) ?? null;
    },
    async invalidateOlderThan(cartId, cartVersion) {
      let invalidated = 0;
      for (const [id, proposal] of proposals) {
        if (
          proposal.cartId === cartId &&
          proposal.cartVersion < cartVersion &&
          proposal.status === "ACTIVE"
        ) {
          proposals.set(id, { ...proposal, status: "INVALIDATED" });
          invalidated += 1;
        }
      }
      return invalidated;
    },
    async expireOverdue(now) {
      let expired = 0;
      for (const [id, proposal] of proposals) {
        if (
          proposal.status === "ACTIVE" &&
          new Date(proposal.expiresAt).getTime() < now.getTime()
        ) {
          proposals.set(id, { ...proposal, status: "EXPIRED" });
          expired += 1;
        }
      }
      return expired;
    },
  };
}

type FakeAttempt = {
  id: string;
  orderId: string;
  attemptNumber: number;
  status: PaymentAttemptStatus;
};

export function fakeOrderStore(): CheckoutOrderStore & {
  orders: Map<string, StoredOrder>;
  operations: Map<string, StoredProviderOperation>;
  providerOrders: Map<string, StoredProviderOrder>;
  attempts: FakeAttempt[];
  payments: Map<string, { captured: boolean; providerStatus: string }>;
  timeline: CheckoutAuditRecord[];
} {
  const orders = new Map<string, StoredOrder>();
  const operations = new Map<string, StoredProviderOperation>();
  const providerOrders = new Map<string, StoredProviderOrder>();
  const attempts: FakeAttempt[] = [];
  const payments = new Map<
    string,
    { captured: boolean; providerStatus: string }
  >();
  const convertedCarts = new Set<string>();
  const timeline: CheckoutAuditRecord[] = [];
  let sequence = 0;
  const nextId = (prefix: string) =>
    `${prefix}0000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`;

  const operationFor = (orderId: string) =>
    [...operations.values()].find(
      (operation) => operation.orderId === orderId,
    ) ?? null;

  return {
    orders,
    operations,
    providerOrders,
    attempts,
    payments,
    timeline,

    async consumeApproval(input) {
      const existing = [...orders.values()].find(
        (order) => order.proposalId === input.proposal.id,
      );
      if (existing) {
        return {
          status: "REPLAYED",
          order: existing,
          operation: operationFor(existing.id)!,
        };
      }

      const refusal = await input.revalidate(
        null as never as Parameters<typeof input.revalidate>[0],
      );
      if (refusal) return { status: "REFUSED", reason: refusal };

      const order: StoredOrder = {
        id: nextId("71000000"),
        guestSessionId: input.guestSessionId,
        proposalId: input.proposal.id,
        cartId: input.proposal.cartId,
        cartVersion: input.proposal.cartVersion,
        currency: input.proposal.currency,
        totalMinor: input.proposal.checkoutTotalMinor,
        status: "PAYMENT_SETUP",
      };
      const operation: StoredProviderOperation = {
        id: nextId("81000000"),
        orderId: order.id,
        status: "READY",
        transportAttempts: 0,
        reconciliationReads: 0,
        blockedReason: null,
      };
      orders.set(order.id, order);
      operations.set(operation.id, operation);
      await input.onCreated(
        { order, operation },
        null as never as Parameters<typeof input.onCreated>[1],
      );
      return { status: "CREATED", order, operation };
    },

    async findOrder(orderId) {
      return orders.get(orderId) ?? null;
    },
    async findOrderByProposal(proposalId) {
      return (
        [...orders.values()].find(
          (order) => order.proposalId === proposalId,
        ) ?? null
      );
    },
    async findOperation(orderId) {
      return operationFor(orderId);
    },
    async updateOperation(operationId, change) {
      const operation = operations.get(operationId);
      if (operation) operations.set(operationId, { ...operation, ...change });
    },
    async findProviderOrder(orderId) {
      return providerOrders.get(orderId) ?? null;
    },
    async attachProviderOrder({ orderId, providerOrder }) {
      // One Provider Order per Order, as the unique index enforces.
      if (!providerOrders.has(orderId)) {
        providerOrders.set(orderId, providerOrder);
      }
    },
    async setOrderStatus(orderId, status: OrderStatus) {
      const order = orders.get(orderId);
      if (order) orders.set(orderId, { ...order, status });
    },
    /**
     * Paid Order and converted Cart, in one step as the database does it.
     *
     * A Cart the fake has already converted converts no second time, which is
     * what makes a duplicated confirmation harmless here as it is in Postgres.
     */
    async markOrderPaid({ orderId, cartId, recordConversion }) {
      const order = orders.get(orderId);
      if (order) orders.set(orderId, { ...order, status: "PAID" });
      if (convertedCarts.has(cartId)) return;
      convertedCarts.add(cartId);
      await recordConversion(
        null as never as Parameters<typeof recordConversion>[0],
      );
    },

    async countPaymentAttempts(orderId) {
      return attempts.filter((attempt) => attempt.orderId === orderId).length;
    },
    async openPaymentAttempt({ orderId, attemptNumber }) {
      if (
        attempts.some(
          (attempt) =>
            attempt.orderId === orderId &&
            attempt.attemptNumber === attemptNumber,
        )
      ) {
        return null;
      }
      const attempt: FakeAttempt = {
        id: nextId("91000000"),
        orderId,
        attemptNumber,
        status: "OPENED",
      };
      attempts.push(attempt);
      return { id: attempt.id, attemptNumber };
    },
    async resolvePaymentAttempt(attemptId, status) {
      const attempt = attempts.find((candidate) => candidate.id === attemptId);
      if (attempt && attempt.status === "OPENED") attempt.status = status;
    },
    async latestOpenPaymentAttempt(orderId) {
      const open = attempts
        .filter(
          (attempt) =>
            attempt.orderId === orderId && attempt.status === "OPENED",
        )
        .at(-1);
      return open ? { id: open.id } : null;
    },
    async recordProviderPayment(input) {
      const existing = payments.get(input.providerPaymentId);
      payments.set(input.providerPaymentId, {
        captured: (existing?.captured ?? false) || input.captured,
        providerStatus: existing?.captured
          ? existing.providerStatus
          : input.providerStatus,
      });
    },
    async hasCapturedPayment() {
      return [...payments.values()].some((payment) => payment.captured);
    },
    async readTimeline() {
      return timeline;
    },
  };
}

/**
 * A scripted provider.
 *
 * Answers are functions of the request so a test can respond with the receipt
 * and identifiers the store actually minted, which is what makes a "matching
 * Provider Order" genuinely matching rather than merely plausible. An empty
 * script answers each write with a Provider Order that matches its own
 * request, which is the ordinary case.
 */
export type FakeGatewayScript = {
  createOrder?: Array<
    ProviderWriteOutcome | ((input: CreateProviderOrderInput) => ProviderWriteOutcome)
  >;
  findByReceipt?: Array<
    | ProviderReadOutcome<ProviderOrderResult>
    | ((receipt: string) => ProviderReadOutcome<ProviderOrderResult>)
  >;
  payment?: ProviderReadOutcome<ProviderPaymentResult>;
};

export function fakeProviderGateway(script: FakeGatewayScript) {
  const calls: Array<{ tool: string; input: unknown }> = [];
  const creates = [...(script.createOrder ?? [])];
  const receipts = [...(script.findByReceipt ?? [])];

  const gateway: RazorpayProviderGateway = {
    async createOrder(input: CreateProviderOrderInput) {
      calls.push({ tool: "create_order", input });
      const next = creates.shift();
      if (typeof next === "function") return next(input);
      return (
        next ?? {
          status: "SUCCEEDED",
          providerOrder: providerOrderForRequest(input),
        }
      );
    },
    async findOrderByReceipt(receipt) {
      calls.push({ tool: "fetch_all_orders", input: receipt });
      const next = receipts.shift();
      if (typeof next === "function") return next(receipt);
      return next ?? { status: "ABSENT" };
    },
    async fetchOrder(providerOrderId) {
      calls.push({ tool: "fetch_order", input: providerOrderId });
      return { status: "ABSENT" };
    },
    async fetchPayment(providerPaymentId) {
      calls.push({ tool: "fetch_payment", input: providerPaymentId });
      return script.payment ?? { status: "ABSENT" };
    },
  };
  return { gateway, calls };
}

/**
 * The Provider Order a compliant Razorpay would create for one request:
 * the same receipt, the same amount, the same currency, the same notes.
 */
export function providerOrderForRequest(
  input: CreateProviderOrderInput,
  overrides: Partial<ProviderOrderResult> = {},
): ProviderOrderResult {
  return {
    providerOrderId: `order_TEST_${input.receipt.slice(-8)}`,
    receipt: input.receipt,
    amountMinor: input.amountMinor,
    currency: input.currency,
    status: "created",
    notes: input.notes,
    ...overrides,
  };
}

export function providerOrderFor(
  receipt: string,
  orderId: string,
  proposalId: string,
  overrides: Partial<ProviderOrderResult> = {},
): ProviderOrderResult {
  return {
    providerOrderId: "order_TEST0000000001",
    receipt,
    amountMinor: 1599700,
    currency: "INR",
    status: "created",
    notes: { orderId, proposalId, cartVersion: "4", environment: "TEST" },
    ...overrides,
  };
}

export const enabledRazorpay: RazorpayTestConfiguration & {
  status: "ENABLED";
} = {
  status: "ENABLED",
  keyId: "rzp_test_examplekey",
  environmentMode: "TEST",
  basicAuthorization: () => "Basic ignored",
  verifyCheckoutSignature: (
    _providerOrderId: string,
    _providerPaymentId: string,
    signature: string,
  ): boolean => signature === "valid-signature",
  verifyNotificationSignature: (): boolean => true,
};
