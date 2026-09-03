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
import type { CheckoutAuditLog } from "./checkout-audit";
import type { CheckoutOrderStore } from "./checkout-store";

export type NotificationReceipt =
  | { status: "ACCEPTED" }
  | { status: "DUPLICATE" }
  | { status: "HELD" };

export interface ProviderNotificationInbox {
  receive(facts: ProviderNotificationFacts): Promise<NotificationReceipt>;
}

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
    if (captured && association.status !== "PAID") {
      await options.orders.setOrderStatus(association.orderId, "PAID");
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
  }

  /**
   * Re-examines events that arrived before their Provider Order existed.
   *
   * Held events are replayed in arrival order whenever a later delivery for the
   * same Provider Order can be associated, so an early `payment.captured` is
   * eventually applied rather than lost.
   */
  async function drainHeld(providerOrderId: string) {
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
    }
  }

  const inbox: ProviderNotificationInbox = {
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

      if (!stored) return { status: "DUPLICATE" };
      if (!association) return { status: "HELD" };

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
