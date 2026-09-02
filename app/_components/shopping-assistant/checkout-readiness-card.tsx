import { CircleAlert, CircleCheck } from "lucide-react";

import type { CheckoutReadiness } from "@/modules/cart/checkout-readiness";
import { CartPanel } from "./cart-panel";

/**
 * Renders one deterministic Checkout Readiness result.
 *
 * Every value shown is the authoritative one the review evaluated, and the card
 * names the Cart version it read, so a Customer can tell which Cart was
 * judged. The Cart Summary is read-only: changing the Cart stays with the
 * deterministic Cart controls.
 */
export function CheckoutReadinessCard({
  readiness,
}: {
  readiness: CheckoutReadiness;
}) {
  const isReady = readiness.status === "READY";

  return (
    <section
      aria-label="Checkout readiness"
      className="overflow-hidden rounded-3xl border border-[#1d2a24]/10 bg-white/70 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1d2a24]/10 px-5 py-4 sm:px-6">
        <p className="flex items-center gap-2 text-sm font-semibold">
          {isReady ? (
            <CircleCheck className="size-4 text-[#57a773]" />
          ) : (
            <CircleAlert className="size-4 text-red-700" />
          )}
          {isReady ? "Ready for checkout" : "Not ready for checkout"}
        </p>
        <p className="text-xs text-[#708176]">
          Evaluated at Cart version {readiness.cart.version}
        </p>
      </div>

      {readiness.blockers.length > 0 ? (
        <ul className="divide-y divide-[#1d2a24]/10">
          {readiness.blockers.map((blocker) => (
            <li
              key={blocker.code}
              className="px-5 py-4 text-sm text-red-700 sm:px-6"
            >
              {blocker.message}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="px-5 py-5 sm:px-6">
        <CartPanel cart={readiness.cart} />
      </div>

      <p className="bg-[#eef1eb] px-5 py-3 text-xs text-[#708176] sm:px-6">
        This review reserves no inventory and starts no payment.
      </p>
    </section>
  );
}
