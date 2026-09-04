import { MessageSquarePlus, Radio, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { CartView } from "@/modules/cart/cart";
import type { CartControls } from "./cart-panel";
import {
  CartDrawer,
  type CartLoadState,
  type CheckoutControl,
  type CheckoutReadinessControl,
} from "./cart-drawer";

export function Header({
  brandName,
  cart,
  cartState,
  hasConversation,
  onNewConversation,
  cartControls,
  checkoutReadiness,
  checkout,
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
  isCartOpen: boolean;
  onCartOpenChange: (open: boolean) => void;
}) {
  return (
    <header className="flex items-center justify-between gap-3">
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
          open={isCartOpen}
          onOpenChange={onCartOpenChange}
        />
      </div>
    </header>
  );
}
