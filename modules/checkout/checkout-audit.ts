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
  | "ORDER_PAYMENT_FAILED"
  | "PROVIDER_NOTIFICATION_RECEIVED"
  | "PROVIDER_NOTIFICATION_DUPLICATE"
  | "PROVIDER_NOTIFICATION_HELD"
  | "PROVIDER_NOTIFICATION_REFUSED";

export type CheckoutAuditEvent = {
  entityType: string;
  entityId: string;
  /**
   * The Checkout Proposal every event of one checkout shares.
   *
   * Correlating on the proposal rather than the Order means preparation,
   * policy, and Approval — all of which happen before an Order exists — belong
   * to the same story as the payment that follows them.
   */
  correlationId: string;
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
