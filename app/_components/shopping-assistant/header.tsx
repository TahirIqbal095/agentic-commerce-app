import { MessageSquarePlus, Radio, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { CartView } from "@/modules/cart/cart";
import type { CartControls } from "./cart-panel";
import {
  CartDrawer,
  type CartLoadState,
  type CartOutcome,
  type CheckoutControl,
  type CheckoutReadinessControl,
} from "./cart-drawer";

/**
 * The Storefront's pinned header bar.
 *
 * The bar spans the viewport and stays put while the Conversation Transcript
 * scrolls beneath it, so the Cart, the New conversation control, and the Brand
 * mark are reachable from any depth of a long Conversation. Its contents are
 * held to the same reading column as the Conversation, and its bottom border
 * mirrors the composer dock's top border so the Conversation reads as passing
 * under a bar rather than colliding with floating text.
 *
 * Pinning is sticky rather than fixed, so the document reserves the bar's own
 * height and the first thing in the Conversation cannot end up tucked
 * underneath it.
 */
export function Header({
  brandName,
  cart,
  cartState,
  hasConversation,
  onNewConversation,
  cartControls,
  checkoutReadiness,
  checkout,
  cartOutcome,
  isCartOpen,
  onCartOpenChange,
}: {
  brandName: string;
  cart: CartView | null;
  cartState: CartLoadState;
  hasConversation: boolean;
  onNewConversation: () => void;
  cartControls: CartControls;
  checkoutReadiness: CheckoutReadinessControl;
  checkout: CheckoutControl;
  cartOutcome: CartOutcome | null;
  isCartOpen: boolean;
  onCartOpenChange: (open: boolean) => void;
}) {
  return (
    <header className="sticky top-0 z-40 h-[var(--storefront-header-height)] border-b-2 border-sidebar-border bg-background">
      <div className="mx-auto flex h-full w-full max-w-[var(--storefront-column)] items-center justify-between gap-3 px-4 sm:px-8">
        <div
          className="flex items-center gap-2.5"
          aria-label={`${brandName} Storefront`}
        >
          <span className="grid size-9 place-items-center rounded-md border-2 border-sidebar-border bg-primary text-primary-foreground">
            <Sparkles className="size-4" />
          </span>
          <span className="text-sm font-bold tracking-tight">{brandName}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1.5 eyebrow text-[10px] text-secondary sm:flex">
            <Radio aria-hidden="true" className="size-3.5" />
            Live catalog
          </span>
          {hasConversation ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="New conversation"
              onClick={onNewConversation}
              className="max-sm:size-8 max-sm:px-0"
            >
              <MessageSquarePlus />
              <span className="max-sm:sr-only">New conversation</span>
            </Button>
          ) : null}
          <CartDrawer
            cart={cart}
            state={cartState}
            controls={cartControls}
            readiness={checkoutReadiness}
            checkout={checkout}
            outcome={cartOutcome}
            open={isCartOpen}
            onOpenChange={onCartOpenChange}
          />
        </div>
      </div>
    </header>
  );
}
