/**
 * The durable records one Conversational Checkout owns, and the narrow
 * capabilities the checkout authority holds over them.
 *
 * The authority is deterministic and testable because it never reaches a
 * database directly: it asks for exactly the reads and writes its rules need,
 * and a route supplies either the Postgres-backed store or a fake. The
 * interfaces are split by lifetime — guest-owned proposals and Approvals in
 * one, protected commerce evidence in the other — so a capability to read a
 * Customer's proposal never carries the power to change an Order.
 */

import { and, asc, desc, eq, lt, sql } from "drizzle-orm";
import type { DbExecutor } from "@/db";
import { db as storefrontDatabase } from "@/db";
import { auditEvents } from "@/db/schema/audit";
import {
  checkoutApprovals,
  checkoutProposals,
  orderItems,
  orders,
  paymentAttempts,
  providerOperations,
  providerOrders,
  providerPayments,
} from "@/db/schema/checkout";
import type { CheckoutAuditRecord } from "./checkout-timeline";
import type {
  CheckoutProposal,
  CheckoutProposalLine,
} from "./checkout-proposal";
import type {
  OrderStatus,
  PaymentAttemptStatus,
  ProviderOperationStatus,
} from "./checkout-status";

export type StoredApproval = {
  id: string;
  proposalId: string;
  approvedTotalMinor: number;
  currency: string;
  expiresAt: Date;
  consumedAt: Date | null;
};

export type StoredOrder = {
  id: string;
  guestSessionId: string;
  proposalId: string;
  cartId: string;
  cartVersion: number;
  currency: string;
  totalMinor: number;
  status: OrderStatus;
};

export type StoredProviderOperation = {
  id: string;
  orderId: string;
  status: ProviderOperationStatus;
  transportAttempts: number;
  reconciliationReads: number;
  blockedReason: string | null;
};

export type StoredProviderOrder = {
  providerOrderId: string;
  receipt: string;
  amountMinor: number;
  currency: string;
  providerStatus: string;
};

/**
 * The guest-owned half: Checkout Proposals and the Approvals that consume
 * them. Both cascade with the Guest Session that created them.
 */
export interface CheckoutProposalStore {
  /** Replays one Customer command key rather than preparing a second proposal. */
  findByCommandKey(commandKey: string): Promise<CheckoutProposal | null>;
  save(proposal: CheckoutProposal, commandKey: string): Promise<void>;
  findById(proposalId: string): Promise<CheckoutProposal | null>;
  /** Retires every unconsumed proposal prepared from an earlier Cart version. */
  invalidateOlderThan(cartId: string, cartVersion: number): Promise<number>;
  /** Marks proposals whose ten minutes have run out, so status is truthful. */
  expireOverdue(now: Date): Promise<number>;
}

/**
 * The protected half: Orders, Provider Operations, Provider Orders, Payment
 * Attempts, and Provider Payments, which outlive the Guest Session.
 */
export interface CheckoutOrderStore {
  /**
   * Consumes one Approval and creates its Order in a single transaction.
   *
   * No external call happens inside it. The unique Order-per-proposal and
   * Provider-Operation-per-Order constraints mean a racing second submission
   * loses the write and is answered with the Order that already exists.
   */
  consumeApproval(input: {
    proposal: CheckoutProposal;
    approvalKey: string;
    approvedTotalMinor: number;
    guestSessionId: string;
    now: Date;
    revalidate: (executor: DbExecutor) => Promise<string | null>;
    onCreated: (
      created: { order: StoredOrder; operation: StoredProviderOperation },
      executor: DbExecutor,
    ) => Promise<void>;
  }): Promise<
    | { status: "CREATED"; order: StoredOrder; operation: StoredProviderOperation }
    | { status: "REPLAYED"; order: StoredOrder; operation: StoredProviderOperation }
    | { status: "REFUSED"; reason: string }
  >;
  findOrder(orderId: string): Promise<StoredOrder | null>;
  /**
   * Finds the Order one Checkout Proposal produced.
   *
   * A reloaded browser knows the proposal it was shown but not the Order that
   * consumed it, so this is how a refreshed Transcript recovers the checkout
   * already in flight instead of offering a second Approval for it.
   */
  findOrderByProposal(proposalId: string): Promise<StoredOrder | null>;
  findOperation(orderId: string): Promise<StoredProviderOperation | null>;
  updateOperation(
    operationId: string,
    change: Partial<
      Pick<
        StoredProviderOperation,
        "status" | "transportAttempts" | "reconciliationReads" | "blockedReason"
      >
    >,
  ): Promise<void>;
  findProviderOrder(orderId: string): Promise<StoredProviderOrder | null>;
  attachProviderOrder(input: {
    orderId: string;
    operationId: string;
    providerOrder: StoredProviderOrder;
    notes: Record<string, string>;
  }): Promise<void>;
  setOrderStatus(orderId: string, status: OrderStatus): Promise<void>;
  countPaymentAttempts(orderId: string): Promise<number>;
  openPaymentAttempt(input: {
    orderId: string;
    providerOrderId: string;
    attemptNumber: number;
  }): Promise<{ id: string; attemptNumber: number } | null>;
  resolvePaymentAttempt(
    attemptId: string,
    status: PaymentAttemptStatus,
    now: Date,
  ): Promise<void>;
  latestOpenPaymentAttempt(orderId: string): Promise<{ id: string } | null>;
  /**
   * Records provider payment evidence monotonically: once captured, later
   * stale evidence cannot uncapture it.
   */
  recordProviderPayment(input: {
    providerPaymentId: string;
    providerOrderId: string;
    paymentAttemptId: string | null;
    providerStatus: string;
    captured: boolean;
    amountMinor: number;
    currency: string;
  }): Promise<void>;
  hasCapturedPayment(providerOrderId: string): Promise<boolean>;
  readTimeline(correlationId: string): Promise<CheckoutAuditRecord[]>;
}

export function createCheckoutProposalStore(
  guestSessionId: string,
  database: DbExecutor = storefrontDatabase,
): CheckoutProposalStore {
  const toProposal = (row: typeof checkoutProposals.$inferSelect) => ({
    id: row.id,
    cartId: row.cartId,
    cartVersion: row.cartVersion,
    currency: row.currency,
    lines: row.lines as CheckoutProposalLine[],
    itemsSubtotalMinor: row.itemsSubtotalMinor,
    discountMinor: row.discountMinor,
    shippingMinor: row.shippingMinor,
    taxMinor: row.taxMinor,
    checkoutTotalMinor: row.checkoutTotalMinor,
    policy: {
      result: "REQUIRE_APPROVAL" as const,
      reasonCode: row.policyReasonCode as "PAYMENT_REQUIRES_CUSTOMER_APPROVAL",
      explanation: row.policyExplanation,
    },
    status: row.status,
    preparedAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  });

  const store: CheckoutProposalStore = {
    async findByCommandKey(commandKey) {
      const [row] = await database
        .select()
        .from(checkoutProposals)
        .where(
          and(
            eq(checkoutProposals.guestSessionId, guestSessionId),
            eq(checkoutProposals.commandKey, commandKey),
          ),
        )
        .limit(1);
      return row ? toProposal(row) : null;
    },

    async save(proposal, commandKey) {
      await database.insert(checkoutProposals).values({
        id: proposal.id,
        guestSessionId,
        commandKey,
        cartId: proposal.cartId,
        cartVersion: proposal.cartVersion,
        currency: proposal.currency,
        lines: proposal.lines,
        itemsSubtotalMinor: proposal.itemsSubtotalMinor,
        discountMinor: proposal.discountMinor,
        shippingMinor: proposal.shippingMinor,
        taxMinor: proposal.taxMinor,
        checkoutTotalMinor: proposal.checkoutTotalMinor,
        policyResult: proposal.policy.result,
        policyReasonCode: proposal.policy.reasonCode,
        policyExplanation: proposal.policy.explanation,
        status: proposal.status,
        expiresAt: new Date(proposal.expiresAt),
      });
    },

    async findById(proposalId) {
      const [row] = await database
        .select()
        .from(checkoutProposals)
        .where(
          and(
            eq(checkoutProposals.id, proposalId),
            eq(checkoutProposals.guestSessionId, guestSessionId),
          ),
        )
        .limit(1);
      return row ? toProposal(row) : null;
    },

    async invalidateOlderThan(cartId, cartVersion) {
      const invalidated = await database
        .update(checkoutProposals)
        .set({ status: "INVALIDATED", updatedAt: new Date() })
        .where(
          and(
            eq(checkoutProposals.guestSessionId, guestSessionId),
            eq(checkoutProposals.cartId, cartId),
            lt(checkoutProposals.cartVersion, cartVersion),
            eq(checkoutProposals.status, "ACTIVE"),
          ),
        )
        .returning({ id: checkoutProposals.id });
      return invalidated.length;
    },

    async expireOverdue(now) {
      const expired = await database
        .update(checkoutProposals)
        .set({ status: "EXPIRED", updatedAt: now })
        .where(
          and(
            eq(checkoutProposals.guestSessionId, guestSessionId),
            eq(checkoutProposals.status, "ACTIVE"),
            lt(checkoutProposals.expiresAt, now),
          ),
        )
        .returning({ id: checkoutProposals.id });
      return expired.length;
    },
  };
  return Object.freeze(store);
}

/** The executor an Order store needs: reads, writes, and a transaction. */
export type CheckoutDatabase = DbExecutor &
  Pick<typeof storefrontDatabase, "transaction">;

export function createCheckoutOrderStore(
  database: CheckoutDatabase = storefrontDatabase,
): CheckoutOrderStore {
  const toOrder = (row: typeof orders.$inferSelect): StoredOrder => ({
    id: row.id,
    guestSessionId: row.guestSessionId,
    proposalId: row.proposalId,
    cartId: row.cartId,
    cartVersion: row.cartVersion,
    currency: row.currency,
    totalMinor: row.totalMinor,
    status: row.status,
  });
  const toOperation = (
    row: typeof providerOperations.$inferSelect,
  ): StoredProviderOperation => ({
    id: row.id,
    orderId: row.orderId,
    status: row.status,
    transportAttempts: row.transportAttempts,
    reconciliationReads: row.reconciliationReads,
    blockedReason: row.blockedReason,
  });

  async function readOrderByProposal(
    executor: DbExecutor,
    proposalId: string,
  ): Promise<{ order: StoredOrder; operation: StoredProviderOperation } | null> {
    const [orderRow] = await executor
      .select()
      .from(orders)
      .where(eq(orders.proposalId, proposalId))
      .limit(1);
    if (!orderRow) return null;
    const [operationRow] = await executor
      .select()
      .from(providerOperations)
      .where(eq(providerOperations.orderId, orderRow.id))
      .limit(1);
    return operationRow
      ? { order: toOrder(orderRow), operation: toOperation(operationRow) }
      : null;
  }

  const store: CheckoutOrderStore = {
    async consumeApproval(input) {
      const existing = await readOrderByProposal(database, input.proposal.id);
      if (existing) return { status: "REPLAYED", ...existing };

      try {
        return await database.transaction(async (transaction) => {
          const replayed = await readOrderByProposal(
            transaction,
            input.proposal.id,
          );
          if (replayed) return { status: "REPLAYED" as const, ...replayed };

          const refusal = await input.revalidate(transaction);
          if (refusal) return { status: "REFUSED" as const, reason: refusal };

          const [approval] = await transaction
            .insert(checkoutApprovals)
            .values({
              proposalId: input.proposal.id,
              guestSessionId: input.guestSessionId,
              approvalKey: input.approvalKey,
              approvedTotalMinor: input.approvedTotalMinor,
              currency: input.proposal.currency,
              expiresAt: new Date(input.proposal.expiresAt),
              consumedAt: input.now,
            })
            .returning({ id: checkoutApprovals.id });

          await transaction
            .update(checkoutProposals)
            .set({ status: "CONSUMED", updatedAt: input.now })
            .where(eq(checkoutProposals.id, input.proposal.id));

          const [orderRow] = await transaction
            .insert(orders)
            .values({
              guestSessionId: input.guestSessionId,
              proposalId: input.proposal.id,
              approvalId: approval.id,
              cartId: input.proposal.cartId,
              cartVersion: input.proposal.cartVersion,
              currency: input.proposal.currency,
              itemsSubtotalMinor: input.proposal.itemsSubtotalMinor,
              discountMinor: input.proposal.discountMinor,
              shippingMinor: input.proposal.shippingMinor,
              taxMinor: input.proposal.taxMinor,
              totalMinor: input.proposal.checkoutTotalMinor,
              status: "PAYMENT_SETUP",
            })
            .returning();

          await transaction.insert(orderItems).values(
            input.proposal.lines.map((line) => ({
              orderId: orderRow.id,
              productId: line.productId,
              productName: line.productName,
              quantity: line.quantity,
              unitPriceMinor: line.cartPriceMinor,
              lineTotalMinor: line.lineTotalMinor,
            })),
          );

          const [operationRow] = await transaction
            .insert(providerOperations)
            .values({ orderId: orderRow.id, operationType: "CREATE_ORDER" })
            .returning();

          const created = {
            order: toOrder(orderRow),
            operation: toOperation(operationRow),
          };
          await input.onCreated(created, transaction);
          return { status: "CREATED" as const, ...created };
        });
      } catch (error) {
        // A racing submission won the unique Order-per-proposal index. The
        // Customer's answer is the Order that already exists, never a second.
        const raced = await readOrderByProposal(database, input.proposal.id);
        if (raced) return { status: "REPLAYED", ...raced };
        throw error;
      }
    },

    async findOrder(orderId) {
      const [row] = await database
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);
      return row ? toOrder(row) : null;
    },

    async findOrderByProposal(proposalId) {
      const [row] = await database
        .select()
        .from(orders)
        .where(eq(orders.proposalId, proposalId))
        .limit(1);
      return row ? toOrder(row) : null;
    },

    async findOperation(orderId) {
      const [row] = await database
        .select()
        .from(providerOperations)
        .where(eq(providerOperations.orderId, orderId))
        .limit(1);
      return row ? toOperation(row) : null;
    },

    async updateOperation(operationId, change) {
      await database
        .update(providerOperations)
        .set({ ...change, updatedAt: new Date() })
        .where(eq(providerOperations.id, operationId));
    },

    async findProviderOrder(orderId) {
      const [row] = await database
        .select()
        .from(providerOrders)
        .where(eq(providerOrders.orderId, orderId))
        .limit(1);
      return row
        ? {
            providerOrderId: row.providerOrderId,
            receipt: row.receipt,
            amountMinor: row.amountMinor,
            currency: row.currency,
            providerStatus: row.providerStatus,
          }
        : null;
    },

    async attachProviderOrder({ orderId, operationId, providerOrder, notes }) {
      await database
        .insert(providerOrders)
        .values({
          orderId,
          operationId,
          providerOrderId: providerOrder.providerOrderId,
          receipt: providerOrder.receipt,
          amountMinor: providerOrder.amountMinor,
          currency: providerOrder.currency,
          providerStatus: providerOrder.providerStatus,
          notes,
        })
        .onConflictDoNothing();
    },

    async setOrderStatus(orderId, status) {
      await database
        .update(orders)
        .set({ status, updatedAt: new Date() })
        .where(eq(orders.id, orderId));
    },

    async countPaymentAttempts(orderId) {
      const [row] = await database
        .select({ total: sql<number>`count(*)::int` })
        .from(paymentAttempts)
        .where(eq(paymentAttempts.orderId, orderId));
      return row?.total ?? 0;
    },

    async openPaymentAttempt({ orderId, providerOrderId, attemptNumber }) {
      const [row] = await database
        .insert(paymentAttempts)
        .values({ orderId, providerOrderId, attemptNumber })
        .onConflictDoNothing()
        .returning({
          id: paymentAttempts.id,
          attemptNumber: paymentAttempts.attemptNumber,
        });
      return row ?? null;
    },

    async resolvePaymentAttempt(attemptId, status, now) {
      await database
        .update(paymentAttempts)
        .set({ status, resolvedAt: now })
        .where(
          and(
            eq(paymentAttempts.id, attemptId),
            eq(paymentAttempts.status, "OPENED"),
          ),
        );
    },

    async latestOpenPaymentAttempt(orderId) {
      const [row] = await database
        .select({ id: paymentAttempts.id })
        .from(paymentAttempts)
        .where(
          and(
            eq(paymentAttempts.orderId, orderId),
            eq(paymentAttempts.status, "OPENED"),
          ),
        )
        .orderBy(desc(paymentAttempts.attemptNumber))
        .limit(1);
      return row ?? null;
    },

    async recordProviderPayment(input) {
      await database
        .insert(providerPayments)
        .values({
          providerPaymentId: input.providerPaymentId,
          providerOrderId: input.providerOrderId,
          paymentAttemptId: input.paymentAttemptId,
          providerStatus: input.providerStatus,
          captured: input.captured,
          amountMinor: input.amountMinor,
          currency: input.currency,
        })
        .onConflictDoUpdate({
          target: providerPayments.providerPaymentId,
          // Monotonic under ADR-0014: a captured Provider Payment stays
          // captured, so a duplicated or out-of-order failure notice cannot
          // regress evidence the Customer has already been shown.
          set: {
            providerStatus: sql`case when ${providerPayments.captured} then ${providerPayments.providerStatus} else excluded.provider_status end`,
            captured: sql`${providerPayments.captured} or excluded.captured`,
            paymentAttemptId: sql`coalesce(${providerPayments.paymentAttemptId}, excluded.payment_attempt_id)`,
            updatedAt: new Date(),
          },
        });
    },

    async hasCapturedPayment(providerOrderId) {
      const [row] = await database
        .select({ id: providerPayments.id })
        .from(providerPayments)
        .where(
          and(
            eq(providerPayments.providerOrderId, providerOrderId),
            eq(providerPayments.captured, true),
          ),
        )
        .limit(1);
      return row !== undefined;
    },

    async readTimeline(correlationId) {
      return database
        .select({
          id: auditEvents.id,
          eventType: auditEvents.eventType,
          message: auditEvents.message,
          detail: auditEvents.detail,
          customerVisible: auditEvents.customerVisible,
          occurredAt: auditEvents.occurredAt,
        })
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.correlationId, correlationId),
            eq(auditEvents.customerVisible, true),
          ),
        )
        .orderBy(asc(auditEvents.occurredAt), asc(auditEvents.id));
    },
  };
  return Object.freeze(store);
}
