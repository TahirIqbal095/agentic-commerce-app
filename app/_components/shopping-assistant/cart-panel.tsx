import { CircleAlert, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";

import { Alert } from "@/components/ui/alert";
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
 *
 * Figures are set in the theme's monospaced face and right-aligned in one
 * column, so quantities, Cart Prices, and subtotals line up down the list and a
 * Customer can compare Cart Items without reading every line.
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
      className="overflow-hidden rounded-lg border-2 border-sidebar-border bg-card text-card-foreground"
    >
      <div className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-6">
        <h3 className="text-sm font-semibold tracking-tight">Your Cart</h3>
        <p className="eyebrow text-[10px] text-muted-foreground">
          {cart.totalQuantity} {cart.totalQuantity === 1 ? "unit" : "units"}
        </p>
      </div>

      {cart.items.length === 0 ? (
        <div className="px-5 py-12 text-center sm:px-6">
          <ShoppingBag
            aria-hidden="true"
            className="mx-auto mb-4 size-8 text-muted-foreground"
          />
          <p className="font-medium">Your Cart is empty.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Add a Product from the Storefront when you find the right one.
          </p>
        </div>
      ) : (
        <ol className="divide-y divide-border">
          {cart.items.map((item) => (
            <li
              key={item.productId}
              className="grid gap-2 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-start sm:px-6"
            >
              <div className="min-w-0">
                <p className="font-medium">{item.productName}</p>
                <p className="mt-1 font-mono text-sm text-muted-foreground">
                  {item.quantity} ×{" "}
                  {formatMoney(item.cartPriceMinor, cart.currency)}
                </p>
                {controls ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
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
                      size="icon-sm"
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
                      variant="destructive"
                      size="sm"
                      aria-label={`Remove ${item.productName} from Cart`}
                      disabled={controls.pendingCommands.has(
                        `${item.productId}:remove`,
                      )}
                      onClick={() =>
                        controls.onCommand(item.productId, "remove")
                      }
                    >
                      <Trash2 />
                      Remove
                    </Button>
                  </div>
                ) : null}
                {controls?.itemFeedback[item.productId] ? (
                  <Alert role="alert" className="mt-3">
                    <CircleAlert aria-hidden="true" />
                    <span>{controls.itemFeedback[item.productId]}</span>
                  </Alert>
                ) : null}
              </div>
              <p
                aria-label={`${item.productName} subtotal`}
                className="font-mono text-sm font-bold tabular-nums sm:text-right"
              >
                {formatMoney(item.subtotalMinor, cart.currency)}
              </p>
            </li>
          ))}
        </ol>
      )}

      <div className="flex items-center justify-between border-t-2 border-sidebar-border bg-muted px-5 py-4 sm:px-6">
        <p className="text-sm font-semibold tracking-tight">Cart Subtotal</p>
        <p
          aria-label="Cart Subtotal"
          className="font-mono text-lg font-bold tabular-nums"
        >
          {formatMoney(cart.subtotalMinor, cart.currency)}
        </p>
      </div>
    </section>
  );
}
