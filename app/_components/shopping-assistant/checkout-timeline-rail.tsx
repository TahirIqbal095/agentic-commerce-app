import type { CheckoutTimelineEntry } from "@/modules/checkout/checkout-status";
import { CheckoutTimeline } from "./checkout-timeline";

/**
 * The viewport above which the Checkout Timeline reads beside the Conversation
 * rather than inside the checkout status card.
 *
 * It is wider than the rail plus the Conversation's reading measure, so the
 * rail never appears by taking width away from the Transcript: approving a
 * checkout must not re-wrap every message the Customer has already read.
 */
export const TIMELINE_RAIL_MEDIA_QUERY = "(min-width: 1400px)";

/**
 * The Checkout Timeline, pinned beside the Conversation.
 *
 * A Customer reading what their payment did should not have to scroll away
 * from the Conversation to find it, nor watch it scroll out of view when they
 * scroll back. So on a wide viewport the account moves out of the status card
 * and stays put beneath the header while the Conversation moves past it. It
 * scrolls within itself once it outgrows the viewport, so a long checkout and
 * a long Conversation read independently.
 *
 * The Timeline has exactly one home on screen: where this rail shows it, the
 * status card does not.
 */
export function CheckoutTimelineRail({
  entries,
}: {
  entries: CheckoutTimelineEntry[];
}) {
  return (
    <div className="sticky top-[calc(var(--storefront-header-height)+2rem)] mt-14 max-h-[calc(100vh-var(--storefront-header-height)-4rem)] w-80 shrink-0 self-start overflow-y-auto rounded-lg border-2 border-sidebar-border bg-card text-card-foreground sm:mt-20">
      <CheckoutTimeline entries={entries} />
    </div>
  );
}
