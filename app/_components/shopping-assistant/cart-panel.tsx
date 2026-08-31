import { formatMoney } from "@/lib/format-money";
import type { CartView } from "@/modules/cart/cart";

export function CartPanel({ cart }: { cart: CartView }) {
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

      <ol className="divide-y divide-[#1d2a24]/10">
        {cart.items.map((item) => (
          <li
            key={item.productId}
            className="grid gap-2 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-center sm:px-6"
          >
            <div>
              <p className="font-medium text-[#1d2a24]">{item.productName}</p>
              <p className="mt-1 text-sm text-[#708176]">
                {item.quantity} × {item.priceComparison ? "Cart Price " : ""}
                {formatMoney(item.cartPriceMinor, cart.currency)}
              </p>
              {item.priceComparison ? (
                <p className="mt-1 text-sm font-medium text-amber-700">
                  Current price{" "}
                  {formatMoney(
                    item.priceComparison.currentBasePriceMinor,
                    cart.currency,
                  )}{" "}
                  — {item.priceComparison.direction.toLowerCase()}
                </p>
              ) : null}
              {cart.priceChange?.productId === item.productId ? (
                <p className="mt-1 text-sm font-medium text-amber-700">
                  Cart Price{" "}
                  {cart.priceChange.currentCartPriceMinor >
                  cart.priceChange.previousCartPriceMinor
                    ? "increased"
                    : "decreased"}{" "}
                  from{" "}
                  {formatMoney(
                    cart.priceChange.previousCartPriceMinor,
                    cart.currency,
                  )}{" "}
                  to{" "}
                  {formatMoney(
                    cart.priceChange.currentCartPriceMinor,
                    cart.currency,
                  )}
                  .
                </p>
              ) : null}
              {item.availabilityWarning ? (
                <p
                  role="alert"
                  className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800"
                >
                  {item.availabilityWarning.reason === "INACTIVE"
                    ? "This Product is no longer active."
                    : `Only ${item.availabilityWarning.availableQuantity} of ${item.quantity} units is currently available.`}
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

      <div className="flex items-center justify-between bg-[#eef1eb] px-5 py-4 sm:px-6">
        <p className="text-sm font-medium">Cart Subtotal</p>
        <p className="text-lg font-semibold tabular-nums">
          {formatMoney(cart.subtotalMinor, cart.currency)}
        </p>
      </div>
    </section>
  );
}
