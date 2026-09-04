/**
 * The one way a confirmed capture is recorded.
 *
 * The Storefront can learn that Razorpay captured a payment two ways: the
 * browser callback, and an authenticated Provider Notification that fires when
 * no browser is attached. Both must leave exactly the same records behind, so
 * both reach for this rather than assembling the call themselves. A fix
 * applied only to the path a developer exercises by hand would otherwise look
 * correct in every manual test and leave a Customer holding a paid Cart
 * whenever the notification won the race.
 */

import { cartConvertedEvent, type CheckoutAuditLog } from "./checkout-audit";
import type { CheckoutOrderStore } from "./checkout-store";

/** The Order whose capture was confirmed, and the Cart it was created from. */
export type PaidOrder = {
  id: string;
  cartId: string;
  proposalId: string;
  guestSessionId: string;
};

/**
 * Marks one Order paid, converts the Cart it was created from, and records the
 * Customer's account of the conversion — all in one transaction.
 *
 * @param options.occurredAt - When the capture was confirmed, as the path that
 *   confirmed it understands time: the Storefront's clock for a browser
 *   callback, Razorpay's for a Provider Notification.
 */
export function confirmOrderPaid(options: {
  orders: CheckoutOrderStore;
  audit: CheckoutAuditLog;
  order: PaidOrder;
  occurredAt: Date;
}): Promise<void> {
  const { orders, audit, order, occurredAt } = options;
  return orders.markOrderPaid({
    orderId: order.id,
    cartId: order.cartId,
    now: occurredAt,
    recordConversion: (executor) =>
      audit.record(
        cartConvertedEvent({
          cartId: order.cartId,
          orderId: order.id,
          proposalId: order.proposalId,
          guestSessionId: order.guestSessionId,
          occurredAt,
        }),
        executor,
      ),
  });
}
