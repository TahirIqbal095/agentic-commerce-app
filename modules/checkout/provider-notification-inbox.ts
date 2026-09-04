/**
 * The durable inbox that turns asynchronous Razorpay deliveries into commerce
 * state, exactly once and never backwards.
 *
 * Three separate concerns meet here and are deliberately kept apart:
 * deduplication (has this Razorpay event ID already been accepted?),
 * association (do we yet know which Order this Provider Order belongs to?), and
 * projection (what may this evidence change?). An event we cannot associate is
 * retained rather than discarded or guessed at, and re-examined the next time
 * association becomes possible.
 */

import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db as storefrontDatabase } from "@/db";
import type { DbExecutor } from "@/db";
import {
  orders,
  providerNotifications,
  providerOrders,
} from "@/db/schema/checkout";
import type {
  ProviderNotificationFacts,
} from "@/modules/payments/provider-notification";
import { notificationReportsCapture } from "@/modules/payments/provider-notification";
import type { CheckoutAuditLog, CheckoutEventType } from "./checkout-audit";
import { confirmOrderPaid } from "./order-payment";
import type { CheckoutOrderStore } from "./checkout-store";

export type NotificationReceipt =
  | { status: "ACCEPTED" }
  | { status: "DUPLICATE" }
  | { status: "HELD" };

/**
 * Razorpay's own half of the inbox: delivering evidence, and nothing else.
 *
 * The webhook route holds exactly this. Releasing evidence is not Razorpay's
 * to trigger, so that half is deliberately out of the route's reach.
 */
export interface ProviderNotificationIntake {
  receive(facts: ProviderNotificationFacts): Promise<NotificationReceipt>;
}

/**
 * The checkout authority's half: applying evidence that arrived too early.
 *
 * The authority is the only place that can make association possible, because
 * it is the only place that attaches a verified Provider Order — so it is given
 * exactly this one call and never `receive`.
 */
export interface HeldNotificationRelease {
  /**
   * Applies the evidence that arrived before this Provider Order was known.
   *
   * @param providerOrderId - The Provider Order that has just become known.
   * @returns How many held events became commerce state.
   */
  releaseHeldFor(providerOrderId: string): Promise<number>;
}

export interface ProviderNotificationInbox
  extends ProviderNotificationIntake,
    HeldNotificationRelease {}

export type ProviderNotificationInboxOptions = {
  database?: DbExecutor;
  orders: CheckoutOrderStore;
  audit: CheckoutAuditLog;
  now?: () => Date;
};

export function createProviderNotificationInbox(
  options: ProviderNotificationInboxOptions,
): ProviderNotificationInbox {
  const database = options.database ?? storefrontDatabase;
  const now = options.now ?? (() => new Date());

  /**
   * Finds the internal Order one Provider Order belongs to.
   *
   * Association is by Razorpay's own order identifier, which we stored when we
   * verified the Provider Order. An event naming an order we never created is
   * simply not associable, which is a legitimate state rather than an error.
   */
  async function associate(providerOrderId: string | null) {
    if (!providerOrderId) return null;
    const [row] = await database
      .select({
        orderId: providerOrders.orderId,
        proposalId: orders.proposalId,
        guestSessionId: orders.guestSessionId,
        cartId: orders.cartId,
        status: orders.status,
      })
      .from(providerOrders)
      .innerJoin(orders, eq(orders.id, providerOrders.orderId))
      .where(eq(providerOrders.providerOrderId, providerOrderId))
      .limit(1);
    return row ?? null;
  }

  /**
   * Applies one associable event's evidence.
   *
   * Every write is monotonic: a captured Provider Payment is recorded through
   * the store's capture-preserving upsert, and an Order is only ever moved
   * forward to PAID. Stale failure evidence arriving after a capture therefore
   * changes nothing, which is precisely what a Customer looking at a paid Order
   * needs.
   */
  async function apply(
    facts: ProviderNotificationFacts,
    association: NonNullable<Awaited<ReturnType<typeof associate>>>,
  ) {
    const captured = notificationReportsCapture(facts);
    if (facts.providerPaymentId) {
      await options.orders.recordProviderPayment({
        providerPaymentId: facts.providerPaymentId,
        providerOrderId: facts.providerOrderId!,
        paymentAttemptId: null,
        providerStatus: facts.providerStatus ?? facts.eventType,
        captured,
        amountMinor: facts.amountMinor ?? 0,
        currency: facts.currency ?? "INR",
      });
    }
    await options.audit.record({
      entityType: "ProviderNotification",
      entityId: facts.eventId,
      correlationId: association.proposalId,
      actorType: "RAZORPAY",
      eventType: "PROVIDER_NOTIFICATION_RECEIVED",
      reasonCode: facts.eventType,
      message: captured
        ? "Razorpay confirmed that this test payment was captured."
        : "Razorpay sent an update about this payment.",
      detail: facts.providerPaymentId
        ? `Payment reference ${facts.providerPaymentId}`
        : null,
      amountMinor: facts.amountMinor,
      currency: facts.currency,
      providerReference: facts.providerOrderId,
      guestSessionId: association.guestSessionId,
      customerVisible: true,
      occurredAt: facts.occurredAt,
    });

    // Razorpay may confirm a capture before — or instead of — the browser
    // callback, so this is a path to a paid Order in its own right. It must
    // leave the same Order paid event behind as the callback path, or a
    // Customer whose payment was only ever confirmed asynchronously would read
    // a timeline that stops short of saying their Order is paid.
    if (captured && association.status !== "PAID") {
      // The same operation the browser callback uses, so a Customer whose
      // capture was only ever confirmed asynchronously has their Cart become
      // order history exactly as one whose browser was still open does.
      await confirmOrderPaid({
        orders: options.orders,
        audit: options.audit,
        order: {
          id: association.orderId,
          cartId: association.cartId,
          proposalId: association.proposalId,
          guestSessionId: association.guestSessionId,
        },
        occurredAt: facts.occurredAt,
      });
      await options.audit.record({
        entityType: "Order",
        entityId: association.orderId,
        correlationId: association.proposalId,
        actorType: "SYSTEM",
        eventType: "ORDER_PAID",
        reasonCode: "ORDER_PAID",
        message:
          "This Order is paid in Razorpay Test Mode. No real money moved and no inventory was reserved.",
        priorState: association.status,
        newState: "PAID",
        amountMinor: facts.amountMinor,
        currency: facts.currency,
        providerReference: facts.providerOrderId,
        guestSessionId: association.guestSessionId,
        customerVisible: true,
        occurredAt: facts.occurredAt,
      });
    }
  }

  /**
   * Re-examines events that arrived before their Provider Order existed.
   *
   * Held events are replayed in arrival order the moment association becomes
   * possible — either because the checkout authority has just attached the
   * Provider Order, or because a later associable delivery arrived for it — so
   * an early `payment.captured` is applied rather than lost.
   */
  async function drainHeld(providerOrderId: string): Promise<number> {
    const held = await database
      .select()
      .from(providerNotifications)
      .where(
        and(
          eq(providerNotifications.providerOrderId, providerOrderId),
          isNull(providerNotifications.appliedAt),
        ),
      )
      .orderBy(asc(providerNotifications.receivedAt));

    let applied = 0;
    for (const row of held) {
      const association = await associate(row.providerOrderId);
      if (!association) continue;
      await apply(
        {
          eventId: row.eventId,
          eventType: row.eventType,
          providerOrderId: row.providerOrderId,
          providerPaymentId: row.providerPaymentId,
          providerStatus: row.providerStatus,
          amountMinor: row.amountMinor,
          currency: row.currency,
          occurredAt: row.occurredAt,
        },
        association,
      );
      await database
        .update(providerNotifications)
        .set({ appliedAt: now() })
        .where(eq(providerNotifications.id, row.id));
      applied += 1;
    }
    return applied;
  }

  /**
   * Records that an authenticated delivery changed nothing, and why.
   *
   * A Brand operator asked to explain payment behavior needs the deliveries
   * that were set aside as much as the ones that were applied: a repeat proves
   * deduplication held, and a hold proves valid evidence was retained rather
   * than guessed at or dropped. Neither is a Customer-facing moment, so neither
   * is Customer-visible and neither has a Customer-facing title to project
   * through.
   *
   * Only authenticated deliveries reach here, so the rows one caller can add
   * are bounded by Razorpay's own retry behavior.
   */
  async function recordUnapplied(
    facts: ProviderNotificationFacts,
    association: Awaited<ReturnType<typeof associate>>,
    outcome: { eventType: CheckoutEventType; message: string },
  ) {
    await options.audit.record({
      entityType: "ProviderNotification",
      entityId: facts.eventId,
      correlationId: association?.proposalId ?? null,
      actorType: "RAZORPAY",
      eventType: outcome.eventType,
      reasonCode: facts.eventType,
      message: outcome.message,
      amountMinor: facts.amountMinor,
      currency: facts.currency,
      providerReference: facts.providerOrderId,
      guestSessionId: association?.guestSessionId ?? null,
      occurredAt: facts.occurredAt,
    });
  }

  const inbox: ProviderNotificationInbox = {
    releaseHeldFor: drainHeld,

    async receive(facts) {
      const association = await associate(facts.providerOrderId);
      const [stored] = await database
        .insert(providerNotifications)
        .values({
          eventId: facts.eventId,
          eventType: facts.eventType,
          providerOrderId: facts.providerOrderId,
          providerPaymentId: facts.providerPaymentId,
          providerStatus: facts.providerStatus,
          amountMinor: facts.amountMinor,
          currency: facts.currency,
          occurredAt: facts.occurredAt,
          appliedAt: association ? now() : null,
        })
        .onConflictDoNothing({ target: providerNotifications.eventId })
        .returning({ id: providerNotifications.id });

      if (!stored) {
        await recordUnapplied(facts, association, {
          eventType: "PROVIDER_NOTIFICATION_DUPLICATE",
          message:
            "Razorpay delivered this event again. It was recognized and applied only once.",
        });
        return { status: "DUPLICATE" };
      }
      if (!association) {
        await recordUnapplied(facts, null, {
          eventType: "PROVIDER_NOTIFICATION_HELD",
          message:
            "Razorpay sent an update for a payment this Storefront has not attached yet. It is retained until it can be associated.",
        });
        return { status: "HELD" };
      }

      await apply(facts, association);
      if (facts.providerOrderId) await drainHeld(facts.providerOrderId);
      return { status: "ACCEPTED" };
    },
  };
  return Object.freeze(inbox);
}

/** Counts events still waiting for a Provider Order, for operational tests. */
export async function heldNotificationCount(
  database: DbExecutor = storefrontDatabase,
): Promise<number> {
  const [row] = await database
    .select({ total: sql<number>`count(*)::int` })
    .from(providerNotifications)
    .where(isNull(providerNotifications.appliedAt));
  return row?.total ?? 0;
}
