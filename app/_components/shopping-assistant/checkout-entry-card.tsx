import type { CartView } from "@/modules/cart/cart-view";
import { isCheckoutReadinessOutdated } from "@/modules/cart/checkout-readiness";
import type { CheckoutActionEntry } from "@/modules/agent/customer-action-entry";
import { isCheckoutProposalOutdated } from "@/modules/checkout/checkout-proposal";
import type { CheckoutStatusView } from "@/modules/checkout/checkout-status";
import { CheckoutProposalCard } from "./checkout-proposal-card";
import { CheckoutStatusCard } from "./checkout-status-card";
import { CheckoutReadinessCard } from "./checkout-readiness-card";
import { CheckoutUnavailableCard } from "./checkout-unavailable-card";
import type { CartControls } from "./cart-panel";

/**
 * One Customer's checkout, from the Storefront's answer to their Check out
 * command onward.
 *
 * The three answers a preparation can carry are three different cards, because
 * they ask for three different things: a proposal asks for Approval, a
 * readiness result asks the Customer to correct their Cart, and an unavailable
 * checkout asks for nothing at all. Only the proposal card can authorize a
 * payment.
 */
export type CheckoutSession = {
  isApproving: boolean;
  error: string | null;
  /**
   * The authoritative checkout state, present once an Approval created an
   * Order. It is never derived in the browser: every number on it — the
   * Order's state, the remaining launches, the timeline — comes back from the
   * checkout authority, so a reload cannot invent an extra attempt.
   */
  checkout: CheckoutStatusView | null;
  isPaying: boolean;
};

export function CheckoutEntryCard({
  entry,
  currentCart,
  cartControls,
  session,
  showTimeline = true,
  onApprove,
  onRetry,
  onCheckStatus,
  onReturnToShopping,
}: {
  entry: CheckoutActionEntry;
  currentCart: CartView | null;
  cartControls: CartControls;
  session?: CheckoutSession;
  /** False while the rail beside the Conversation is the Timeline's home. */
  showTimeline?: boolean;
  onApprove?: (entry: CheckoutActionEntry) => void;
  onRetry?: (entry: CheckoutActionEntry) => void;
  onCheckStatus?: (entry: CheckoutActionEntry) => void;
  onReturnToShopping?: () => void;
}) {
  const { preparation } = entry;

  // Once an Approval has created an Order, the proposal has done its work: the
  // Customer needs to see what their payment is doing, not be offered a second
  // authorization for an amount they already approved.
  if (session?.checkout) {
    return (
      <CheckoutStatusCard
        checkout={session.checkout}
        isBusy={session.isPaying}
        error={session.error}
        showTimeline={showTimeline}
        onRetry={onRetry ? () => onRetry(entry) : undefined}
        onCheckStatus={
          onCheckStatus ? () => onCheckStatus(entry) : undefined
        }
        {...(onReturnToShopping ? { onReturnToShopping } : {})}
      />
    );
  }

  if (preparation.status === "NOT_READY") {
    return (
      <CheckoutReadinessCard
        readiness={preparation.readiness}
        isOutdated={isCheckoutReadinessOutdated(
          preparation.readiness,
          currentCart,
        )}
        controls={currentCart ? cartControls : undefined}
      />
    );
  }

  if (preparation.status === "UNAVAILABLE") {
    return (
      <CheckoutUnavailableCard
        explanation={preparation.explanation}
        violations={preparation.violations}
      />
    );
  }

  return (
    <CheckoutProposalCard
      proposal={preparation.proposal}
      isOutdated={isCheckoutProposalOutdated(preparation.proposal, currentCart)}
      isApproving={session?.isApproving ?? false}
      error={session?.error ?? null}
      onApprove={onApprove ? () => onApprove(entry) : undefined}
    />
  );
}
