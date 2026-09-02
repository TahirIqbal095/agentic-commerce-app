import { MessageSquarePlus, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { CartView } from "@/modules/cart/cart";
import { CartDrawer, type CartLoadState } from "./cart-drawer";

export function Header({
  brandName,
  cart,
  cartState,
  hasConversation,
  onNewConversation,
}: {
  brandName: string;
  cart: CartView | null;
  cartState: CartLoadState;
  hasConversation: boolean;
  onNewConversation: () => void;
}) {
  return (
    <header className="flex items-center justify-between">
      <div
        className="flex items-center gap-2.5"
        aria-label={`${brandName} Storefront`}
      >
        <span className="grid size-9 place-items-center rounded-xl bg-[#1d2a24] text-white shadow-sm">
          <Sparkles className="size-4" />
        </span>
        <span className="text-sm font-semibold tracking-[-0.02em]">
          {brandName}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <span className="hidden items-center gap-2 text-xs text-[#6d766f] sm:flex">
          <span className="size-1.5 rounded-full bg-[#57a773] shadow-[0_0_0_3px_rgba(87,167,115,0.12)]" />
          Live catalog
        </span>
        {hasConversation ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onNewConversation}
            className="rounded-full"
          >
            <MessageSquarePlus /> New conversation
          </Button>
        ) : null}
        <CartDrawer cart={cart} state={cartState} />
      </div>
    </header>
  );
}
