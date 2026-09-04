/**
 * The deterministic, application-owned authority for Conversational Checkout.
 *
 * Everything consequential happens here and nowhere else: readiness is
 * evaluated, exact amounts are calculated, policy is recorded, Approval is
 * revalidated and consumed, the Order and its one Provider Operation are
 * created, the single Provider Write is dispatched, an Unknown Provider Outcome
 * is reconciled by receipt, Payment Attempts are bounded, and provider evidence
 * is projected monotonically into payment state.
 *
 * The Commerce Agent may select and explain this experience; it never reaches
 * these operations, never calculates a commercial fact, and never authorizes an
 * effect (ADR-0009). Conversational checkout intent and the Cart's Check out
 * control both arrive here, so there is one orchestrator rather than two
 * behaviors that must be kept in agreement.
 */

import { randomUUID } from "node:crypto";
import type { CartReviewRead } from "@/modules/cart/cart-inspection";
import { createCheckoutReadinessReview } from "@/modules/cart/checkout-readiness";
import type { RazorpayTestConfiguration } from "@/modules/payments/razorpay-config";
import type { RazorpayProviderGateway } from "@/modules/payments/razorpay-gateway";
import type { ProviderOrderResult } from "@/modules/payments/razorpay-tools";
import type { CheckoutAuditLog } from "./checkout-audit";
import { confirmOrderPaid } from "./order-payment";
import {
  CHECKOUT_MAX_PAYMENT_ATTEMPTS,
  CHECKOUT_MAX_RECONCILIATION_READS,
} from "./checkout-bounds";
import type { CheckoutLaunchResult } from "./checkout-launcher";
import {
  checkoutAmountsForCart,
  isCheckoutProposalActionable,
  prepareCheckoutProposal,
  type CheckoutPreparation,
  type CheckoutProposal,
} from "./checkout-proposal";
import type {
  CheckoutOrderStore,
  CheckoutProposalStore,
  StoredOrder,
  StoredProviderOperation,
} from "./checkout-store";
import type { HeldNotificationRelease } from "./provider-notification-inbox";
import type { CheckoutStatusView, OrderStatus } from "./checkout-status";
import { projectCheckoutTimeline } from "./checkout-timeline";

/**
 * Automatic reconciliation stops one read short of the hard maximum.
 *
 * One read happens immediately after an Unknown Provider Outcome and one more
 * runs in the background. The last of the three permitted reads is deliberately
 * left for the Customer's own Check Razorpay status control, so a Customer who
 * is still waiting has something safe to do that is an observation rather than
 * another attempt at creating a payment.
 */
const AUTOMATIC_RECONCILIATION_READS = CHECKOUT_MAX_RECONCILIATION_READS - 1;

export type ApproveCheckoutCommand = {
  proposalId: string;
  approvalKey: string;
  approvedTotalMinor: number;
  currency: string;
};

export type CheckoutRefusal = {
  status: "REFUSED";
  reasonCode: string;
  message: string;
};

export type CheckoutOutcome<Value> = Value | CheckoutRefusal;

export type PaymentAttemptTicket = {
  status: "OPENED";
  attemptId: string;
  attemptNumber: number;
  keyId: string;
  providerOrderId: string;
  amountMinor: number;
  currency: string;
  checkout: CheckoutStatusView;
};

export interface CheckoutAuthority {
  prepare(command: { commandKey: string }): Promise<CheckoutPreparation>;
  approve(
    command: ApproveCheckoutCommand,
  ): Promise<CheckoutOutcome<{ status: "APPROVED"; checkout: CheckoutStatusView }>>;
  /** Reads one checkout by its Order or by the Checkout Proposal behind it. */
  readStatus(orderOrProposalId: string): Promise<CheckoutStatusView | null>;
  /** One bounded, safe observation of what Razorpay actually did. */
  reconcile(orderId: string): Promise<CheckoutOutcome<CheckoutStatusView>>;
  openPaymentAttempt(
    orderId: string,
  ): Promise<CheckoutOutcome<PaymentAttemptTicket>>;
  /** Records what one Payment Attempt produced, verifying every claim. */
  resolvePaymentAttempt(
    orderId: string,
    attemptId: string,
    result: CheckoutLaunchResult,
  ): Promise<CheckoutOutcome<CheckoutStatusView>>;
}

export type CheckoutAuthorityOptions = {
  guestSessionId: string;
  brandName: string;
  cartReview: CartReviewRead;
  proposals: CheckoutProposalStore;
  orders: CheckoutOrderStore;
  provider: RazorpayProviderGateway;
  configuration: RazorpayTestConfiguration;
  audit: CheckoutAuditLog;
  /**
   * Releases Provider Notifications that arrived before this checkout had a
   * Provider Order to attach them to.
   *
   * Razorpay may deliver `payment.captured` before — or instead of — the
   * browser callback, and a delivery that names a Provider Order we have not
   * yet stored cannot be associated. Attaching one is therefore the moment
   * association becomes possible, so the authority tells the inbox rather than
   * leaving valid evidence waiting for a second delivery that may never come.
   *
   * It is required rather than optional: a composition that forgot to wire it
   * would silently stop honouring ADR-0014, and no test could see the gap.
   */
  notifications: HeldNotificationRelease;
  now?: () => Date;
  newId?: () => string;
};

export function createCheckoutAuthority(
  options: CheckoutAuthorityOptions,
): CheckoutAuthority {
  const now = options.now ?? (() => new Date());
  const newId = options.newId ?? (() => randomUUID());
  const { audit, configuration, orders, proposals, provider } = options;

  const refuse = (reasonCode: string, message: string): CheckoutRefusal => ({
    status: "REFUSED",
    reasonCode,
    message,
  });

  /**
   * Reads the whole Customer-visible state of one checkout.
   *
   * Every derived number a Customer acts on — how many launches remain,
   * whether a status check is offered — is computed here from durable records
   * rather than remembered by the browser, so a reload cannot grant an extra
   * attempt.
   */
  async function statusFor(
    order: StoredOrder,
    operation: StoredProviderOperation,
  ): Promise<CheckoutStatusView> {
    const [providerOrder, launchesUsed, timeline] = await Promise.all([
      orders.findProviderOrder(order.id),
      orders.countPaymentAttempts(order.id),
      orders.readTimeline(order.proposalId),
    ]);
    return {
      orderId: order.id,
      status: order.status,
      currency: order.currency,
      totalMinor: order.totalMinor,
      providerOperation: {
        status: operation.status,
        reconciliationReadsUsed: operation.reconciliationReads,
        canCheckStatus:
          operation.status === "OUTCOME_UNKNOWN" &&
          operation.reconciliationReads >= AUTOMATIC_RECONCILIATION_READS &&
          operation.reconciliationReads < CHECKOUT_MAX_RECONCILIATION_READS,
      },
      providerOrder:
        providerOrder && configuration.status === "ENABLED"
          ? {
              providerOrderId: providerOrder.providerOrderId,
              amountMinor: providerOrder.amountMinor,
              currency: providerOrder.currency,
              keyId: configuration.keyId,
            }
          : null,
      launchesUsed,
      launchesRemaining: Math.max(
        CHECKOUT_MAX_PAYMENT_ATTEMPTS - launchesUsed,
        0,
      ),
      ...(operation.blockedReason
        ? { blockedReason: operation.blockedReason }
        : {}),
      timeline: projectCheckoutTimeline(timeline),
    };
  }

  /**
   * Loads one checkout by whichever identifier the caller holds.
   *
   * A live browser knows the Order; a reloaded Transcript knows only the
   * Checkout Proposal it rendered. Both are the same checkout, so both resolve
   * here — and both are refused unless this Guest Session owns it.
   */
  async function loadCheckout(orderOrProposalId: string) {
    const order =
      (await orders.findOrder(orderOrProposalId)) ??
      (await orders.findOrderByProposal(orderOrProposalId));
    if (!order || order.guestSessionId !== options.guestSessionId) return null;
    const operation = await orders.findOperation(order.id);
    return operation ? { order, operation } : null;
  }

  /**
   * The opaque, non-personal identifiers that bind a Provider Order to ours.
   *
   * Conversation content, Guest Session credentials, Customer contact data, and
   * Product descriptions are deliberately absent: notes travel to a third party
   * and are echoed back, so they carry only what reconciliation must verify.
   */
  function bindingNotes(order: StoredOrder): Record<string, string> {
    return {
      orderId: order.id,
      proposalId: order.proposalId,
      cartVersion: String(order.cartVersion),
      environment: "TEST",
    };
  }

  /**
   * Whether a reconciled Provider Order is exactly the one this Approval
   * authorized.
   *
   * Receipt, amount, currency, and the binding notes must all agree. Anything
   * less could attach an unrelated Razorpay order to this Customer's Order and
   * show them a payment for an amount they never approved, so a mismatch stops
   * checkout rather than continuing on a near-match.
   */
  function providerOrderMatches(
    candidate: ProviderOrderResult,
    order: StoredOrder,
    receipt: string,
  ): boolean {
    const notes = bindingNotes(order);
    return (
      candidate.receipt === receipt &&
      candidate.amountMinor === order.totalMinor &&
      candidate.currency === order.currency &&
      candidate.notes.orderId === notes.orderId &&
      candidate.notes.proposalId === notes.proposalId
    );
  }

  async function attachAndSucceed(
    order: StoredOrder,
    operation: StoredProviderOperation,
    providerOrder: ProviderOrderResult,
    reconciled: boolean,
  ) {
    await orders.attachProviderOrder({
      orderId: order.id,
      operationId: operation.id,
      providerOrder: {
        providerOrderId: providerOrder.providerOrderId,
        receipt: providerOrder.receipt,
        amountMinor: providerOrder.amountMinor,
        currency: providerOrder.currency,
        providerStatus: providerOrder.status,
      },
      notes: providerOrder.notes,
    });
    await orders.updateOperation(operation.id, {
      status: "SUCCEEDED",
      blockedReason: null,
    });
    await audit.record({
      entityType: "ProviderOperation",
      entityId: operation.id,
      correlationId: order.proposalId,
      actorType: "SYSTEM",
      eventType: reconciled
        ? "PROVIDER_ORDER_RECONCILED"
        : "PROVIDER_ORDER_CREATED",
      reasonCode: reconciled
        ? "PROVIDER_ORDER_MATCHED_RECEIPT"
        : "PROVIDER_ORDER_CREATED",
      message: reconciled
        ? "Razorpay had already created this exact payment, so no second payment was requested."
        : "Razorpay Test Mode created the payment for the approved amount.",
      detail: `Payment reference ${providerOrder.providerOrderId} · receipt ${providerOrder.receipt}`,
      priorState: operation.status,
      newState: "SUCCEEDED",
      amountMinor: providerOrder.amountMinor,
      currency: providerOrder.currency,
      providerReference: providerOrder.providerOrderId,
      guestSessionId: order.guestSessionId,
      customerVisible: true,
      occurredAt: now(),
    });
    // Only now, with the Provider Order recorded and its creation explained,
    // may evidence that arrived ahead of it be applied. The Checkout Timeline
    // reads events in receipt order for exactly this reason: a capture Razorpay
    // timestamped earlier must still be told after the payment it captured.
    await releaseHeldNotifications(order, providerOrder.providerOrderId);
    return { ...operation, status: "SUCCEEDED" as const, blockedReason: null };
  }

  /**
   * Applies whatever Razorpay already told us about this Provider Order.
   *
   * A failure here must never undo a Provider Order the Storefront has just
   * verified: the evidence stays held and is applied on the next delivery or
   * the next release, whereas rolling back a verified Provider Order would
   * invite a second `create_order` for one that already exists.
   *
   * So the failure is recorded rather than logged. The evidence really is still
   * held, which is what `PROVIDER_NOTIFICATION_HELD` says, and a Brand operator
   * asked later why a paid Razorpay payment took a second delivery to show up
   * needs that fact in the audit history rather than in a server's stdout.
   */
  async function releaseHeldNotifications(
    order: StoredOrder,
    providerOrderId: string,
  ) {
    try {
      await options.notifications.releaseHeldFor(providerOrderId);
    } catch {
      await audit
        .record({
          entityType: "ProviderOrder",
          entityId: providerOrderId,
          correlationId: order.proposalId,
          actorType: "SYSTEM",
          eventType: "PROVIDER_NOTIFICATION_HELD",
          reasonCode: "HELD_EVIDENCE_RELEASE_FAILED",
          message:
            "An earlier Razorpay update for this payment could not be applied yet. It stays retained until the next update or status check.",
          providerReference: providerOrderId,
          guestSessionId: order.guestSessionId,
          occurredAt: now(),
        })
        // Nothing is left to try: the audit history is the recovery, and the
        // verified Provider Order must survive either way.
        .catch(() => undefined);
    }
  }

  async function blockOperation(
    order: StoredOrder,
    operation: StoredProviderOperation,
    reason: string,
    eventType: "PROVIDER_ORDER_MISMATCHED" | "PROVIDER_OPERATION_FAILED",
    reasonCode: string,
  ) {
    await orders.updateOperation(operation.id, {
      status: "FAILED",
      blockedReason: reason,
    });
    await audit.record({
      entityType: "ProviderOperation",
      entityId: operation.id,
      correlationId: order.proposalId,
      actorType: "SYSTEM",
      eventType,
      reasonCode,
      message: reason,
      priorState: operation.status,
      newState: "FAILED",
      guestSessionId: order.guestSessionId,
      customerVisible: true,
      occurredAt: now(),
    });
    return { ...operation, status: "FAILED" as const, blockedReason: reason };
  }

  /**
   * Dispatches the one Provider Write this Approval authorizes.
   *
   * The Provider Operation's own UUID is Razorpay's receipt, so a lost response
   * is recoverable by lookup rather than by writing again. A transport timeout
   * after dispatch records an Unknown Provider Outcome and reconciles once
   * immediately; it never records a failure, because a failure would invite a
   * second `create_order` for a Provider Order that may already exist.
   */
  async function dispatchProviderOrder(
    order: StoredOrder,
    operation: StoredProviderOperation,
  ): Promise<StoredProviderOperation> {
    await orders.updateOperation(operation.id, {
      status: "DISPATCHED",
      transportAttempts: operation.transportAttempts + 1,
    });
    await audit.record({
      entityType: "ProviderOperation",
      entityId: operation.id,
      correlationId: order.proposalId,
      actorType: "SYSTEM",
      eventType: "PROVIDER_ORDER_REQUESTED",
      reasonCode: "PROVIDER_ORDER_REQUESTED",
      message:
        "Asked Razorpay Test Mode to create the payment for the approved amount.",
      detail: `Receipt ${operation.id}`,
      priorState: operation.status,
      newState: "DISPATCHED",
      amountMinor: order.totalMinor,
      currency: order.currency,
      operationKey: operation.id,
      guestSessionId: order.guestSessionId,
      customerVisible: true,
      occurredAt: now(),
    });

    const dispatched: StoredProviderOperation = {
      ...operation,
      status: "DISPATCHED",
      transportAttempts: operation.transportAttempts + 1,
    };
    const outcome = await provider.createOrder({
      amountMinor: order.totalMinor,
      currency: order.currency,
      receipt: operation.id,
      notes: bindingNotes(order),
    });

    if (outcome.status === "SUCCEEDED") {
      return providerOrderMatches(outcome.providerOrder, order, operation.id)
        ? attachAndSucceed(order, dispatched, outcome.providerOrder, false)
        : blockOperation(
            order,
            dispatched,
            "Razorpay returned different payment details, so this checkout was stopped before any payment was requested.",
            "PROVIDER_ORDER_MISMATCHED",
            "PROVIDER_ORDER_MISMATCHED",
          );
    }

    if (outcome.status === "FAILED") {
      return blockOperation(
        order,
        dispatched,
        outcome.message,
        "PROVIDER_OPERATION_FAILED",
        outcome.reasonCode,
      );
    }

    await orders.updateOperation(operation.id, { status: "OUTCOME_UNKNOWN" });
    await audit.record({
      entityType: "ProviderOperation",
      entityId: operation.id,
      correlationId: order.proposalId,
      actorType: "SYSTEM",
      eventType: "PROVIDER_OUTCOME_UNKNOWN",
      reasonCode: outcome.reasonCode,
      message:
        "Razorpay's answer did not arrive, so it is not yet known whether the payment was created. No second payment was requested.",
      detail: `Receipt ${operation.id}`,
      priorState: "DISPATCHED",
      newState: "OUTCOME_UNKNOWN",
      operationKey: operation.id,
      guestSessionId: order.guestSessionId,
      customerVisible: true,
      occurredAt: now(),
    });

    return reconcileOperation(order, {
      ...dispatched,
      status: "OUTCOME_UNKNOWN",
    });
  }

  /**
   * Spends one reconciliation read to learn what Razorpay actually did.
   *
   * An exact match attaches the existing Provider Order and checkout continues,
   * which is the whole point: a lost response must not strand a Customer or
   * duplicate a payment. A mismatch stops checkout. Confirmed absence permits
   * one more bounded transport attempt with identical inputs under the Approval
   * already given, because nothing was created to duplicate.
   */
  async function reconcileOperation(
    order: StoredOrder,
    operation: StoredProviderOperation,
  ): Promise<StoredProviderOperation> {
    if (operation.reconciliationReads >= CHECKOUT_MAX_RECONCILIATION_READS) {
      return operation;
    }
    const reads = operation.reconciliationReads + 1;
    await orders.updateOperation(operation.id, { reconciliationReads: reads });
    await audit.record({
      entityType: "ProviderOperation",
      entityId: operation.id,
      correlationId: order.proposalId,
      actorType: "SYSTEM",
      eventType: "PROVIDER_RECONCILIATION_ATTEMPTED",
      reasonCode: "PROVIDER_RECONCILIATION_ATTEMPTED",
      message: `Looked the payment up by its receipt to find out what Razorpay did (check ${reads} of ${CHECKOUT_MAX_RECONCILIATION_READS}).`,
      detail: `Receipt ${operation.id}`,
      operationKey: operation.id,
      guestSessionId: order.guestSessionId,
      customerVisible: true,
      occurredAt: now(),
    });

    const read = await provider.findOrderByReceipt(operation.id);
    const reconciling = { ...operation, reconciliationReads: reads };

    if (read.status === "FOUND") {
      return providerOrderMatches(read.value, order, operation.id)
        ? attachAndSucceed(order, reconciling, read.value, true)
        : blockOperation(
            order,
            reconciling,
            "Razorpay returned different payment details, so this checkout was stopped before any payment was requested.",
            "PROVIDER_ORDER_MISMATCHED",
            "PROVIDER_ORDER_MISMATCHED",
          );
    }

    if (read.status === "ABSENT") {
      await orders.updateOperation(operation.id, {
        status: "CONFIRMED_ABSENT",
      });
      await audit.record({
        entityType: "ProviderOperation",
        entityId: operation.id,
        correlationId: order.proposalId,
        actorType: "SYSTEM",
        eventType: "PROVIDER_ORDER_CONFIRMED_ABSENT",
        reasonCode: "PROVIDER_ORDER_CONFIRMED_ABSENT",
        message:
          "Razorpay had created nothing, so the same payment request was safe to send again.",
        priorState: "OUTCOME_UNKNOWN",
        newState: "CONFIRMED_ABSENT",
        operationKey: operation.id,
        guestSessionId: order.guestSessionId,
        customerVisible: true,
        occurredAt: now(),
      });
      return dispatchProviderOrder(order, {
        ...reconciling,
        status: "CONFIRMED_ABSENT",
      });
    }

    return reconciling;
  }

  const authority: CheckoutAuthority = {
    async prepare({ commandKey }) {
      if (configuration.status === "DISABLED") {
        // Deliberately unrecorded. A Brand with no Test Mode credentials
        // refuses every checkout for the same unchanging reason, which its
        // configuration already states; writing that constant once per request
        // would let anyone with a Guest Session grow the audit history without
        // adding a single fact to it.
        return {
          status: "UNAVAILABLE",
          reasonCode: configuration.reasonCode,
          explanation: configuration.explanation,
          violations: [],
        };
      }

      const replayed = await proposals.findByCommandKey(commandKey);
      if (replayed) return { status: "PREPARED", proposal: replayed };

      const readiness = await createCheckoutReadinessReview(
        options.cartReview,
      ).review();
      const preparation = prepareCheckoutProposal(readiness, {
        id: newId(),
        now: now(),
      });

      if (preparation.status !== "PREPARED") {
        if (preparation.status === "UNAVAILABLE") {
          await recordUnavailable(commandKey, preparation, readiness.cart);
        }
        return preparation;
      }

      await proposals.invalidateOlderThan(
        preparation.proposal.cartId,
        preparation.proposal.cartVersion,
      );
      await proposals.save(preparation.proposal, commandKey);
      await recordPreparation(preparation.proposal);
      return preparation;
    },

    async approve(command) {
      if (configuration.status === "DISABLED") {
        return refuse(configuration.reasonCode, configuration.explanation);
      }
      await proposals.expireOverdue(now());
      const proposal = await proposals.findById(command.proposalId);
      if (!proposal) {
        return refuse(
          "CHECKOUT_PROPOSAL_NOT_FOUND",
          "That checkout proposal is no longer available. Check out again for a current amount.",
        );
      }
      if (
        command.currency !== proposal.currency ||
        command.approvedTotalMinor !== proposal.checkoutTotalMinor
      ) {
        return refuse(
          "APPROVAL_AMOUNT_MISMATCH",
          "The approved amount no longer matches this proposal. Check out again for a current amount.",
        );
      }

      const consumption = await orders.consumeApproval({
        proposal,
        approvalKey: command.approvalKey,
        approvedTotalMinor: command.approvedTotalMinor,
        guestSessionId: options.guestSessionId,
        now: now(),
        revalidate: () => revalidateForApproval(proposal),
        onCreated: async ({ order, operation }, transaction) => {
          await audit.record(
            {
              entityType: "CheckoutProposal",
              entityId: proposal.id,
              correlationId: proposal.id,
              actorType: "CUSTOMER",
              eventType: "CHECKOUT_APPROVAL_RECORDED",
              reasonCode: "CUSTOMER_APPROVED_EXACT_AMOUNT",
              message:
                "You approved this exact amount for Razorpay Test Checkout.",
              priorState: "ACTIVE",
              newState: "CONSUMED",
              amountMinor: command.approvedTotalMinor,
              currency: proposal.currency,
              operationKey: command.approvalKey,
              guestSessionId: options.guestSessionId,
              customerVisible: true,
              occurredAt: now(),
            },
            transaction,
          );
          await audit.record(
            {
              entityType: "Order",
              entityId: order.id,
              correlationId: proposal.id,
              actorType: "SYSTEM",
              eventType: "ORDER_CREATED",
              reasonCode: "ORDER_CREATED_FROM_APPROVAL",
              message:
                "An Order was created from the approved proposal. No inventory is reserved by this test checkout.",
              newState: "PAYMENT_SETUP",
              amountMinor: order.totalMinor,
              currency: order.currency,
              operationKey: command.approvalKey,
              guestSessionId: options.guestSessionId,
              customerVisible: true,
              occurredAt: now(),
            },
            transaction,
          );
          await audit.record(
            {
              entityType: "ProviderOperation",
              entityId: operation.id,
              correlationId: proposal.id,
              actorType: "SYSTEM",
              eventType: "PROVIDER_ORDER_REQUESTED",
              reasonCode: "PROVIDER_OPERATION_READY",
              message: "Payment preparation was made ready for Razorpay.",
              newState: "READY",
              operationKey: operation.id,
              guestSessionId: options.guestSessionId,
              occurredAt: now(),
            },
            transaction,
          );
        },
      });

      if (consumption.status === "REFUSED") {
        return refuse("APPROVAL_REVALIDATION_FAILED", consumption.reason);
      }

      const operation =
        consumption.status === "CREATED"
          ? await dispatchProviderOrder(consumption.order, consumption.operation)
          : consumption.operation;
      const order =
        (await orders.findOrder(consumption.order.id)) ?? consumption.order;

      return {
        status: "APPROVED",
        checkout: await statusFor(order, operation),
      };
    },

    async readStatus(orderOrProposalId) {
      const checkout = await loadCheckout(orderOrProposalId);
      return checkout
        ? statusFor(checkout.order, checkout.operation)
        : null;
    },

    async reconcile(orderId) {
      const checkout = await loadCheckout(orderId);
      if (!checkout) {
        return refuse("ORDER_NOT_FOUND", "That checkout is not available.");
      }
      const { order, operation } = checkout;
      if (
        operation.status !== "OUTCOME_UNKNOWN" ||
        operation.reconciliationReads >= CHECKOUT_MAX_RECONCILIATION_READS
      ) {
        return statusFor(order, operation);
      }
      const reconciled = await reconcileOperation(order, operation);
      const latest = (await orders.findOrder(order.id)) ?? order;
      return statusFor(latest, reconciled);
    },

    async openPaymentAttempt(orderId) {
      const checkout = await loadCheckout(orderId);
      if (!checkout || configuration.status === "DISABLED") {
        return refuse("ORDER_NOT_FOUND", "That checkout is not available.");
      }
      const { order, operation } = checkout;
      const providerOrder = await orders.findProviderOrder(order.id);
      if (operation.status !== "SUCCEEDED" || !providerOrder) {
        return refuse(
          "PROVIDER_ORDER_UNVERIFIED",
          "Payment cannot open until Razorpay's payment for this exact amount has been verified.",
        );
      }
      if (
        providerOrder.amountMinor !== order.totalMinor ||
        providerOrder.currency !== order.currency
      ) {
        return refuse(
          "PROVIDER_ORDER_MISMATCHED",
          "Razorpay's payment details do not match the approved amount, so payment was not opened.",
        );
      }
      if (order.status === "PAID") {
        return refuse("ORDER_ALREADY_PAID", "This Order is already paid.");
      }

      const used = await orders.countPaymentAttempts(order.id);
      if (used >= CHECKOUT_MAX_PAYMENT_ATTEMPTS) {
        return refuse(
          "PAYMENT_ATTEMPT_LIMIT_REACHED",
          `Razorpay Test Checkout can be opened ${CHECKOUT_MAX_PAYMENT_ATTEMPTS} times for one Order. Start a new checkout to try again.`,
        );
      }
      const attempt = await orders.openPaymentAttempt({
        orderId: order.id,
        providerOrderId: providerOrder.providerOrderId,
        attemptNumber: used + 1,
      });
      if (!attempt) {
        return refuse(
          "PAYMENT_ATTEMPT_RACED",
          "Another attempt is already open for this Order.",
        );
      }

      await orders.setOrderStatus(order.id, "PAYMENT_PENDING");
      await audit.record({
        entityType: "PaymentAttempt",
        entityId: attempt.id,
        correlationId: order.proposalId,
        actorType: "CUSTOMER",
        eventType: "CHECKOUT_LAUNCH_OPENED",
        reasonCode: "CHECKOUT_LAUNCH_OPENED",
        message: `Razorpay Test Checkout opened (attempt ${attempt.attemptNumber} of ${CHECKOUT_MAX_PAYMENT_ATTEMPTS}). Card, UPI, and OTP details are collected by Razorpay.`,
        priorState: order.status,
        newState: "PAYMENT_PENDING",
        amountMinor: order.totalMinor,
        currency: order.currency,
        providerReference: providerOrder.providerOrderId,
        guestSessionId: order.guestSessionId,
        customerVisible: true,
        occurredAt: now(),
      });

      const latest = (await orders.findOrder(order.id)) ?? order;
      return {
        status: "OPENED",
        attemptId: attempt.id,
        attemptNumber: attempt.attemptNumber,
        keyId: configuration.keyId,
        providerOrderId: providerOrder.providerOrderId,
        amountMinor: providerOrder.amountMinor,
        currency: providerOrder.currency,
        checkout: await statusFor(latest, operation),
      };
    },

    async resolvePaymentAttempt(orderId, attemptId, result) {
      const checkout = await loadCheckout(orderId);
      if (!checkout || configuration.status === "DISABLED") {
        return refuse("ORDER_NOT_FOUND", "That checkout is not available.");
      }
      const { order, operation } = checkout;
      const providerOrder = await orders.findProviderOrder(order.id);
      if (!providerOrder) {
        return refuse(
          "PROVIDER_ORDER_UNVERIFIED",
          "This checkout has no verified Razorpay payment.",
        );
      }

      if (result.outcome !== "COMPLETED") {
        await orders.resolvePaymentAttempt(
          attemptId,
          result.outcome === "DISMISSED" ? "DISMISSED" : "FAILED",
          now(),
        );
        await audit.record({
          entityType: "PaymentAttempt",
          entityId: attemptId,
          correlationId: order.proposalId,
          actorType: "CUSTOMER",
          eventType:
            result.outcome === "DISMISSED"
              ? "CHECKOUT_LAUNCH_DISMISSED"
              : "CHECKOUT_LAUNCH_FAILED",
          reasonCode:
            result.outcome === "DISMISSED"
              ? "CHECKOUT_DISMISSED_BY_CUSTOMER"
              : "CHECKOUT_LAUNCH_FAILED",
          message:
            result.outcome === "DISMISSED"
              ? "You closed Razorpay Test Checkout. No charge was attempted."
              : `Razorpay Test Checkout did not complete: ${result.description}`,
          guestSessionId: order.guestSessionId,
          customerVisible: true,
          occurredAt: now(),
        });
        return finishOrExhaust(order, operation);
      }

      const verified =
        configuration.verifyCheckoutSignature(
          result.providerOrderId,
          result.paymentId,
          result.signature,
        ) && result.providerOrderId === providerOrder.providerOrderId;
      if (!verified) {
        await orders.resolvePaymentAttempt(attemptId, "FAILED", now());
        await audit.record({
          entityType: "PaymentAttempt",
          entityId: attemptId,
          correlationId: order.proposalId,
          actorType: "SYSTEM",
          eventType: "PAYMENT_CALLBACK_REFUSED",
          reasonCode: "PAYMENT_CALLBACK_UNVERIFIED",
          message:
            "The payment result from your browser could not be verified, so this Order was not marked paid.",
          guestSessionId: order.guestSessionId,
          customerVisible: true,
          occurredAt: now(),
        });
        return refuse(
          "PAYMENT_CALLBACK_UNVERIFIED",
          "That payment result could not be verified.",
        );
      }

      await audit.record({
        entityType: "PaymentAttempt",
        entityId: attemptId,
        correlationId: order.proposalId,
        actorType: "SYSTEM",
        eventType: "PAYMENT_CALLBACK_VERIFIED",
        reasonCode: "PAYMENT_CALLBACK_VERIFIED",
        message:
          "The payment result was verified against the payment Razorpay created.",
        providerReference: providerOrder.providerOrderId,
        guestSessionId: order.guestSessionId,
        customerVisible: true,
        occurredAt: now(),
      });

      // The browser's claim is never enough on its own: authoritative Razorpay
      // state decides whether this Order is paid.
      const payment = await provider.fetchPayment(result.paymentId);
      if (payment.status !== "FOUND") {
        return refuse(
          "PAYMENT_STATE_UNAVAILABLE",
          "Razorpay could not confirm this payment yet. Check the status again shortly.",
        );
      }
      const captured =
        payment.value.captured ||
        payment.value.status === "captured" ||
        payment.value.status === "paid";
      await orders.recordProviderPayment({
        providerPaymentId: payment.value.providerPaymentId,
        providerOrderId: providerOrder.providerOrderId,
        paymentAttemptId: attemptId,
        providerStatus: payment.value.status,
        captured,
        amountMinor: payment.value.amountMinor,
        currency: payment.value.currency,
      });
      await orders.resolvePaymentAttempt(
        attemptId,
        captured ? "CAPTURED" : "FAILED",
        now(),
      );

      if (!captured) {
        await audit.record({
          entityType: "PaymentAttempt",
          entityId: attemptId,
          correlationId: order.proposalId,
          actorType: "RAZORPAY",
          eventType: "CHECKOUT_LAUNCH_FAILED",
          reasonCode: "PAYMENT_NOT_CAPTURED",
          message: `Razorpay reported this test payment as ${payment.value.status} rather than captured.`,
          providerReference: payment.value.providerPaymentId,
          guestSessionId: order.guestSessionId,
          customerVisible: true,
          occurredAt: now(),
        });
        return finishOrExhaust(order, operation);
      }

      // The Order reaching its paid state and its Cart becoming order history
      // commit together, so no crash can leave a Customer holding a live Cart
      // full of Products they have already paid for. It stays ahead of the
      // events that describe it: a crash between the two under-reports a paid
      // Order, which reconciliation corrects, where the other order would have
      // left a timeline claiming an Order was paid when it was not.
      await confirmOrderPaid({
        orders,
        audit,
        order,
        occurredAt: now(),
      });
      await audit.record({
        entityType: "ProviderPayment",
        entityId: payment.value.providerPaymentId,
        correlationId: order.proposalId,
        actorType: "RAZORPAY",
        eventType: "PAYMENT_CAPTURED",
        reasonCode: "PAYMENT_CAPTURED",
        message: "Razorpay captured this test payment.",
        detail: `Payment reference ${payment.value.providerPaymentId}`,
        amountMinor: payment.value.amountMinor,
        currency: payment.value.currency,
        providerReference: payment.value.providerPaymentId,
        guestSessionId: order.guestSessionId,
        customerVisible: true,
        occurredAt: now(),
      });
      // An authenticated Provider Notification may already have confirmed this
      // capture and said so. The Order is paid either way, but a Customer must
      // read that once, not once per source of evidence.
      if (order.status !== "PAID") {
        await audit.record({
          entityType: "Order",
          entityId: order.id,
          correlationId: order.proposalId,
          actorType: "SYSTEM",
          eventType: "ORDER_PAID",
          reasonCode: "ORDER_PAID",
          message:
            "This Order is paid in Razorpay Test Mode. No real money moved and no inventory was reserved.",
          priorState: order.status,
          newState: "PAID",
          amountMinor: order.totalMinor,
          currency: order.currency,
          guestSessionId: order.guestSessionId,
          customerVisible: true,
          occurredAt: now(),
        });
      }

      const paid = (await orders.findOrder(order.id)) ?? { ...order, status: "PAID" as const };
      return statusFor(paid, operation);
    },
  };

  /**
   * Decides what an unsuccessful Payment Attempt leaves behind.
   *
   * A dismissal or a declined test card is not the end of a checkout while
   * launches remain: the Customer may open the same verified Provider Order
   * again without a fresh Approval. Only exhausting every permitted launch
   * without a capture reaches PAYMENT_FAILED, which is a terminal outcome the
   * Customer is told about plainly.
   */
  async function finishOrExhaust(
    order: StoredOrder,
    operation: StoredProviderOperation,
  ): Promise<CheckoutStatusView> {
    const used = await orders.countPaymentAttempts(order.id);
    let status: OrderStatus = order.status;
    if (used >= CHECKOUT_MAX_PAYMENT_ATTEMPTS && order.status !== "PAID") {
      status = "PAYMENT_FAILED";
      await orders.setOrderStatus(order.id, status);
      await audit.record({
        entityType: "Order",
        entityId: order.id,
        correlationId: order.proposalId,
        actorType: "SYSTEM",
        eventType: "ORDER_PAYMENT_FAILED",
        reasonCode: "PAYMENT_ATTEMPTS_EXHAUSTED",
        message: `Razorpay Test Checkout was opened ${CHECKOUT_MAX_PAYMENT_ATTEMPTS} times without a captured payment, so this Order could not be paid. Your Cart items are still in the Catalog if you would like to start again.`,
        priorState: order.status,
        newState: status,
        guestSessionId: order.guestSessionId,
        customerVisible: true,
        occurredAt: now(),
      });
    }
    return statusFor({ ...order, status }, operation);
  }

  /**
   * Revalidates every commercial fact this Approval depends on.
   *
   * The Cart is re-read and re-judged inside the Approval transaction, so an
   * Approval is refused when the Cart changed, a Product became unavailable,
   * stock fell short, the arithmetic no longer holds, or the proposal expired
   * between preparation and the Customer's press.
   *
   * @returns `null` when the Approval may proceed, or the reason it may not.
   */
  async function revalidateForApproval(
    proposal: CheckoutProposal,
  ): Promise<string | null> {
    if (!isCheckoutProposalActionable(proposal, now())) {
      return "This proposal is no longer valid. Check out again for a current amount.";
    }
    const readiness = await createCheckoutReadinessReview(
      options.cartReview,
    ).review();
    if (readiness.status !== "READY") {
      return (
        readiness.blockers[0]?.message ??
        "Your Cart is no longer ready for checkout."
      );
    }
    if (
      readiness.cart.id !== proposal.cartId ||
      readiness.cart.version !== proposal.cartVersion
    ) {
      return "Your Cart changed after this proposal. Check out again for a current amount.";
    }
    const amounts = checkoutAmountsForCart(readiness.cart);
    if (
      amounts.checkoutTotalMinor !== proposal.checkoutTotalMinor ||
      readiness.cart.currency !== proposal.currency
    ) {
      return "The amount changed after this proposal. Check out again for a current amount.";
    }
    return null;
  }

  /**
   * Records a Cart the Storefront refused to prepare a checkout for.
   *
   * A Cart outside the bounds is a decision about that Cart, so it leaves the
   * same shape of evidence as a checkout that went ahead: which command asked,
   * which bound refused it, and the amount and currency that were out of range.
   * There is no Checkout Proposal to correlate on and no Order to project onto,
   * so the event is operational rather than Customer-visible — the Customer
   * already has the bound named on the unavailable card.
   *
   * @param commandKey - The Customer command this refusal answers.
   * @param preparation - The refusal, carrying its reason and its bounds.
   * @param cart - The Cart that was read and judged.
   */
  async function recordUnavailable(
    commandKey: string,
    preparation: Extract<CheckoutPreparation, { status: "UNAVAILABLE" }>,
    cart: { subtotalMinor: number; currency: string },
  ) {
    await audit.record({
      entityType: "CheckoutPreparation",
      entityId: commandKey,
      correlationId: null,
      actorType: "SYSTEM",
      eventType: "CHECKOUT_UNAVAILABLE",
      reasonCode: preparation.reasonCode,
      message: preparation.explanation,
      detail:
        preparation.violations
          .map((violation) => violation.code)
          .join(", ") || null,
      amountMinor: cart.subtotalMinor,
      currency: cart.currency,
      operationKey: commandKey,
      guestSessionId: options.guestSessionId,
      occurredAt: now(),
    });
  }

  async function recordPreparation(proposal: CheckoutProposal) {
    await audit.record({
      entityType: "CheckoutProposal",
      entityId: proposal.id,
      correlationId: proposal.id,
      actorType: "SYSTEM",
      eventType: "CHECKOUT_PROPOSAL_PREPARED",
      reasonCode: "CHECKOUT_PROPOSAL_PREPARED",
      message: `A checkout was prepared for the exact Cart total, with no discount, shipping, or tax.`,
      detail: `Cart version ${proposal.cartVersion}`,
      newState: "ACTIVE",
      amountMinor: proposal.checkoutTotalMinor,
      currency: proposal.currency,
      guestSessionId: options.guestSessionId,
      customerVisible: true,
      occurredAt: now(),
    });
    await audit.record({
      entityType: "CheckoutProposal",
      entityId: proposal.id,
      correlationId: proposal.id,
      actorType: "SYSTEM",
      eventType: "CHECKOUT_POLICY_EVALUATED",
      reasonCode: proposal.policy.reasonCode,
      message: proposal.policy.explanation,
      newState: proposal.policy.result,
      guestSessionId: options.guestSessionId,
      customerVisible: true,
      occurredAt: now(),
    });
  }

  return Object.freeze(authority);
}
