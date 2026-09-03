import { ClipboardCheck, CreditCard, ShoppingBag } from "lucide-react";

import { Alert } from "@/components/ui/alert";
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
import { ScrollArea } from "@/components/ui/scroll-area";
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

/**
 * The Cart drawer's Check out control.
 *
 * It enters exactly the same deterministic checkout as conversational intent,
 * so a Customer who asks to check out and a Customer who presses the control
 * reach one orchestrator and one Checkout Proposal. Like the review control it
 * stays available for an empty Cart, whose blocker the Customer is entitled to
 * see, and it prepares a proposal rather than starting a payment.
 */
export type CheckoutControl = {
  onCheckout: () => void;
  isPreparing: boolean;
  error: string | null;
};

export function CartDrawer({
  cart,
  state,
  controls,
  readiness,
  checkout,
  open,
  onOpenChange,
}: {
  cart: CartView | null;
  state: CartLoadState;
  controls: CartControls;
  readiness: CheckoutReadinessControl;
  checkout: CheckoutControl;
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
        <Button type="button" variant="outline" size="sm" aria-label={accessibleName}>
          <ShoppingBag />
          {quantity === undefined ? "Cart" : `Cart · ${quantity}`}
        </Button>
      </DrawerTrigger>
      <DrawerContent className="mx-auto max-h-[85vh] max-w-2xl">
        <DrawerHeader className="border-b-2 border-sidebar-border px-5 pb-5 sm:px-7">
          <DrawerTitle>Your Cart</DrawerTitle>
          <DrawerDescription>
            Authoritative Cart Items, quantities, Cart Prices, and Cart
            Subtotal.
          </DrawerDescription>
        </DrawerHeader>
        <ScrollArea className="flex-1" viewportClassName="px-5 py-6 sm:px-7">
          {state === "loading" ? (
            <p
              role="status"
              className="py-10 text-center text-sm text-muted-foreground"
            >
              Loading Cart…
            </p>
          ) : state === "error" || !cart ? (
            <Alert role="alert">
              <span>Cart details are unavailable. Try again shortly.</span>
            </Alert>
          ) : (
            <CartPanel cart={cart} controls={controls} />
          )}
        </ScrollArea>
        <DrawerFooter className="border-t-2 border-sidebar-border px-5 py-5 sm:px-7">
          <Button
            type="button"
            onClick={checkout.onCheckout}
            disabled={checkout.isPreparing}
          >
            <CreditCard />
            Check out
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Prepares an exact amount for your explicit approval. Razorpay Test
            Mode — no real charge is made.
          </p>
          {checkout.error ? (
            <Alert role="alert">
              <span>{checkout.error}</span>
            </Alert>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={readiness.onReview}
            disabled={readiness.isReviewing}
          >
            <ClipboardCheck />
            Review for checkout
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Reviews this Cart for checkout. It reserves no inventory and starts
            no payment.
          </p>
          {readiness.error ? (
            <Alert role="alert">
              <span>{readiness.error}</span>
            </Alert>
          ) : null}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
