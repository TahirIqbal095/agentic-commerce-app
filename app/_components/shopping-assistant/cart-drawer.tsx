import { ShoppingBag } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import type { CartView } from "@/modules/cart/cart";
import { CartPanel, type CartControls } from "./cart-panel";

export type CartLoadState = "loading" | "ready" | "error";

export function CartDrawer({
  cart,
  state,
  controls,
}: {
  cart: CartView | null;
  state: CartLoadState;
  controls: CartControls;
}) {
  const quantity = state === "ready" ? cart?.totalQuantity : undefined;
  const accessibleName =
    quantity !== undefined
      ? `Cart · ${quantity}`
      : state === "loading"
        ? "Cart, loading"
        : "Cart, unavailable";

  return (
    <Drawer shouldScaleBackground={false}>
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
          ) : cart.items.length === 0 ? (
            <div className="py-12 text-center">
              <ShoppingBag className="mx-auto mb-4 size-8 text-[#708176]" />
              <p className="font-medium">Your Cart is empty.</p>
              <p className="mt-2 text-sm text-[#708176]">
                Add a Product from the Storefront when you find the right one.
              </p>
            </div>
          ) : (
            <CartPanel
              cart={cart}
              controls={controls}
            />
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
