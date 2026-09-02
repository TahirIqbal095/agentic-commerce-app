import { ClipboardCheck, ShoppingBag } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import type { CartView } from "@/modules/cart/cart";
import { CartPanel, type CartControls } from "./cart-panel";

export type CartLoadState = "loading" | "ready" | "error";

/**
 * The Cart drawer's Review for checkout control.
 *
 * The control stays available for an empty Cart, because an empty Cart has a
 * deterministic not-ready answer the Customer is entitled to see.
 */
export type CheckoutReadinessControl = {
  onReview: () => void;
  isReviewing: boolean;
  error: string | null;
};

export function CartDrawer({
  cart,
  state,
  controls,
  readiness,
  open,
  onOpenChange,
}: {
  cart: CartView | null;
  state: CartLoadState;
  controls: CartControls;
  readiness: CheckoutReadinessControl;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const quantity = state === "ready" ? cart?.totalQuantity : undefined;
  const accessibleName =
    quantity !== undefined
      ? `Cart · ${quantity}`
      : state === "loading"
        ? "Cart, loading"
        : "Cart, unavailable";

  return (
    <Drawer
      shouldScaleBackground={false}
      open={open}
      onOpenChange={onOpenChange}
    >
      <DrawerTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={accessibleName}
          className="rounded-full border-[#1d2a24]/10 bg-white/45 text-[#39483f] shadow-none hover:bg-white"
        >
          <ShoppingBag />
          {quantity === undefined ? "Cart" : `Cart · ${quantity}`}
        </Button>
      </DrawerTrigger>
      <DrawerContent className="mx-auto max-h-[85vh] max-w-2xl border-[#1d2a24]/10 bg-[#f4f1eb] text-[#1d2a24]">
        <DrawerHeader className="border-b border-[#1d2a24]/10 px-5 pb-5 sm:px-7">
          <DrawerTitle>Your Cart</DrawerTitle>
          <DrawerDescription>
            Authoritative Cart Items, quantities, Cart Prices, and Cart
            Subtotal.
          </DrawerDescription>
        </DrawerHeader>
        <div className="overflow-y-auto px-5 py-6 sm:px-7">
          {state === "loading" ? (
            <p
              role="status"
              className="py-10 text-center text-sm text-[#708176]"
            >
              Loading Cart…
            </p>
          ) : state === "error" || !cart ? (
            <p role="alert" className="py-10 text-center text-sm text-red-700">
              Cart details are unavailable. Try again shortly.
            </p>
          ) : (
            <CartPanel cart={cart} controls={controls} />
          )}
        </div>
        <DrawerFooter className="border-t border-[#1d2a24]/10 px-5 py-5 sm:px-7">
          <Button
            type="button"
            onClick={readiness.onReview}
            disabled={readiness.isReviewing}
            className="rounded-full"
          >
            <ClipboardCheck />
            Review for checkout
          </Button>
          <p className="text-center text-xs text-[#708176]">
            Reviews this Cart for checkout. It reserves no inventory and
            starts no payment.
          </p>
          {readiness.error ? (
            <p role="alert" className="text-center text-sm text-red-700">
              {readiness.error}
            </p>
          ) : null}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
