/**
 * The append-only evidence one Conversational Checkout leaves behind.
 *
 * Every consequential decision, state change, and external notification is
 * recorded here, and the record is deliberately narrow: under ADR-0015 it
 * carries application-owned reason codes, state transitions, amounts,
 * correlation keys, safe Razorpay identifiers, and timestamps — never a
 * credential, an authorization header, a signature, a payment instrument, an
 * OTP, a raw MCP or webhook payload, Conversation text, or model reasoning.
 *
 * The writer exposes recording alone. There is no update and no delete, so
 * "append-only" is a property of the capability a caller holds rather than a
 * convention a caller is asked to follow.
 */

import { auditEvents } from "@/db/schema/audit";
import type { DbExecutor } from "@/db";

/** Who caused this event. A Customer acts only through explicit controls. */
export type CheckoutAuditActor = "CUSTOMER" | "SYSTEM" | "RAZORPAY" | "AGENT";

/**
 * The consequential moments of a checkout.
 *
 * Each is a fact about what happened, never a description of how it was
 * implemented: no MCP, transport, or adapter name appears, because these codes
 * reach the Customer-facing Checkout Timeline through a fixed projection.
 *
 * An unauthenticated Provider Notification is deliberately absent. Recording
 * one would let anyone who can reach the webhook endpoint write rows into the
 * Brand's audit history, so a delivery that fails HMAC verification is refused
 * at the route and leaves no trace behind it.
 */
export type CheckoutEventType =
  | "CHECKOUT_PROPOSAL_PREPARED"
  | "CHECKOUT_POLICY_EVALUATED"
  | "CHECKOUT_UNAVAILABLE"
  | "CHECKOUT_APPROVAL_RECORDED"
  | "ORDER_CREATED"
  | "PROVIDER_ORDER_REQUESTED"
  | "PROVIDER_ORDER_CREATED"
  | "PROVIDER_OUTCOME_UNKNOWN"
  | "PROVIDER_RECONCILIATION_ATTEMPTED"
  | "PROVIDER_ORDER_RECONCILED"
  | "PROVIDER_ORDER_MISMATCHED"
  | "PROVIDER_ORDER_CONFIRMED_ABSENT"
  | "PROVIDER_OPERATION_FAILED"
  | "CHECKOUT_LAUNCH_OPENED"
  | "CHECKOUT_LAUNCH_DISMISSED"
  | "CHECKOUT_LAUNCH_FAILED"
  | "PAYMENT_CALLBACK_VERIFIED"
  | "PAYMENT_CALLBACK_REFUSED"
  | "PAYMENT_CAPTURED"
  | "ORDER_PAID"
  | "CART_CONVERTED"
  | "ORDER_PAYMENT_FAILED"
  | "PROVIDER_NOTIFICATION_RECEIVED"
  | "PROVIDER_NOTIFICATION_DUPLICATE"
  | "PROVIDER_NOTIFICATION_HELD";

export type CheckoutAuditEvent = {
  entityType: string;
  entityId: string;
  /**
   * The Checkout Proposal every event of one checkout shares.
   *
   * Correlating on the proposal rather than the Order means preparation,
   * policy, and Approval — all of which happen before an Order exists — belong
   * to the same story as the payment that follows them. It is `null` only for
   * evidence that belongs to no checkout: a preparation refused before a
   * proposal existed, or a Razorpay delivery for a Provider Order we have not
   * yet attached.
   */
  correlationId: string | null;
  actorType: CheckoutAuditActor;
  eventType: CheckoutEventType;
  reasonCode: string;
  /** The Customer-safe explanation. Never a stack trace or a payload. */
  message: string;
  detail?: string | null;
  priorState?: string | null;
  newState?: string | null;
  amountMinor?: number | null;
  currency?: string | null;
  operationKey?: string | null;
  providerReference?: string | null;
  guestSessionId?: string | null;
  customerVisible?: boolean;
  occurredAt?: Date;
};

/**
 * The Customer's account of their paid Cart becoming order history.
 *
 * A Cart emptying itself is the most startling thing that happens to a
 * Customer's selection, so it is explained where the rest of the checkout is
 * explained rather than left to be inferred from an empty drawer. Both paths
 * that can learn of a capture record this same event, because the conversion
 * is the same fact whichever channel confirmed the payment.
 *
 * @param converted - The Cart that became history and the checkout it belongs
 *   to.
 * @returns The event to record inside the transaction that converts the Cart.
 */
export function cartConvertedEvent(converted: {
  cartId: string;
  orderId: string;
  proposalId: string;
  guestSessionId: string;
  occurredAt?: Date;
}): CheckoutAuditEvent {
  return {
    entityType: "Cart",
    entityId: converted.cartId,
    correlationId: converted.proposalId,
    actorType: "SYSTEM",
    eventType: "CART_CONVERTED",
    reasonCode: "CART_CONVERTED_ON_CAPTURED_PAYMENT",
    message:
      "Your Cart became part of your order history, and a fresh Cart has started. The Products you paid for are on this Order.",
    detail: `Order ${converted.orderId}`,
    priorState: "ACTIVE",
    newState: "CONVERTED",
    guestSessionId: converted.guestSessionId,
    customerVisible: true,
    ...(converted.occurredAt ? { occurredAt: converted.occurredAt } : {}),
  };
}

/**
 * The only capability any checkout code holds over the audit history.
 */
export interface CheckoutAuditLog {
  record(event: CheckoutAuditEvent, executor?: DbExecutor): Promise<void>;
}

/**
 * Creates the durable audit log for one Payment Account environment.
 *
 * A caller may pass the transaction it is already inside, so an event that
 * must be atomic with the state change it describes — Approval consumption
 * creating an Order, for instance — commits or rolls back with it.
 *
 * @param database - The executor used when a caller supplies no transaction.
 * @param environmentMode - The Payment Account these events belong to.
 */
export function createCheckoutAuditLog(
  database: DbExecutor,
  environmentMode: "TEST" = "TEST",
): CheckoutAuditLog {
  const log: CheckoutAuditLog = {
    async record(event, executor) {
      await (executor ?? database).insert(auditEvents).values({
        entityType: event.entityType,
        entityId: event.entityId,
        correlationId: event.correlationId,
        actorType: event.actorType,
        eventType: event.eventType,
        reasonCode: event.reasonCode,
        message: event.message,
        detail: event.detail ?? null,
        priorState: event.priorState ?? null,
        newState: event.newState ?? null,
        amountMinor: event.amountMinor ?? null,
        currency: event.currency ?? null,
        environmentMode,
        operationKey: event.operationKey ?? null,
        providerReference: event.providerReference ?? null,
        guestSessionId: event.guestSessionId ?? null,
        customerVisible: event.customerVisible ?? false,
        occurredAt: event.occurredAt ?? new Date(),
      });
    },
  };
  return Object.freeze(log);
}
