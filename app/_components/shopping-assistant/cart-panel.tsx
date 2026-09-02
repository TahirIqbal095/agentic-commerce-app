import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format-money";
import type { CartView } from "@/modules/cart/cart";

export type CartItemCommand = "increment" | "decrement" | "remove";
export type CartControls = {
  onCommand: (productId: string, command: CartItemCommand) => void;
  pendingCommands: ReadonlySet<string>;
  itemFeedback: Record<string, string>;
};

/**
 * Renders the authoritative Cart Summary.
 *
 * Every commercial value comes from the supplied Cart, including the explicit
 * empty Cart Summary, so no surrounding language can replace or contradict it.
 * Cart Item controls appear only when the surface may change the Cart.
 */
export function CartPanel({
  cart,
  controls,
}: {
  cart: CartView;
  controls?: CartControls;
}) {
  return (
    <section
      aria-label="Your Cart"
      className="overflow-hidden rounded-3xl border border-[#1d2a24]/10 bg-white/70 shadow-sm"
    >
      <div className="flex items-center justify-between border-b border-[#1d2a24]/10 px-5 py-4 sm:px-6">
        <h3 className="text-sm font-semibold">Your Cart</h3>
        <p className="text-xs text-[#708176]">
          {cart.totalQuantity} {cart.totalQuantity === 1 ? "unit" : "units"}
        </p>
      </div>

      {cart.items.length === 0 ? (
        <div className="px-5 py-12 text-center sm:px-6">
          <ShoppingBag className="mx-auto mb-4 size-8 text-[#708176]" />
          <p className="font-medium">Your Cart is empty.</p>
          <p className="mt-2 text-sm text-[#708176]">
            Add a Product from the Storefront when you find the right one.
          </p>
        </div>
      ) : (
        <ol className="divide-y divide-[#1d2a24]/10">
          {cart.items.map((item) => (
            <li
              key={item.productId}
              className="grid gap-2 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-center sm:px-6"
            >
              <div>
                <p className="font-medium text-[#1d2a24]">{item.productName}</p>
                <p className="mt-1 text-sm text-[#708176]">
                  {item.quantity} ×{" "}
                  {formatMoney(item.cartPriceMinor, cart.currency)}
                </p>
                {controls ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={`Decrease ${item.productName} quantity`}
                      disabled={controls.pendingCommands.has(
                        `${item.productId}:decrement`,
                      )}
                      onClick={() =>
                        controls.onCommand(item.productId, "decrement")
                      }
                    >
                      <Minus />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={`Increase ${item.productName} quantity`}
                      disabled={controls.pendingCommands.has(
                        `${item.productId}:increment`,
                      )}
                      onClick={() =>
                        controls.onCommand(item.productId, "increment")
                      }
                    >
                      <Plus />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove ${item.productName} from Cart`}
                      disabled={controls.pendingCommands.has(
                        `${item.productId}:remove`,
                      )}
                      onClick={() => controls.onCommand(item.productId, "remove")}
                      className="text-red-700 hover:text-red-800"
                    >
                      <Trash2 />
                      Remove
                    </Button>
                  </div>
                ) : null}
                {controls?.itemFeedback[item.productId] ? (
                  <p role="alert" className="mt-2 text-sm text-red-700">
                    {controls.itemFeedback[item.productId]}
                  </p>
                ) : null}
              </div>
              <p
                aria-label={`${item.productName} subtotal`}
                className="font-semibold tabular-nums"
              >
                {formatMoney(item.subtotalMinor, cart.currency)}
              </p>
            </li>
          ))}
        </ol>
      )}

      <div className="flex items-center justify-between bg-[#eef1eb] px-5 py-4 sm:px-6">
        <p className="text-sm font-medium">Cart Subtotal</p>
        <p
          aria-label="Cart Subtotal"
          className="text-lg font-semibold tabular-nums"
        >
          {formatMoney(cart.subtotalMinor, cart.currency)}
        </p>
      </div>
    </section>
  );
}
