import { formatMoney } from "@/lib/format-money";
import type { CartView } from "@/modules/cart/cart";

export function CartPanel({
  cart,
  current = false,
  onDiscoverProducts,
  onRemove,
  pendingProductId,
  itemError,
}: {
  cart: CartView;
  current?: boolean;
  onDiscoverProducts?: () => void;
  onRemove?: (productId: string) => void;
  pendingProductId?: string | null;
  itemError?: { productId: string; message: string };
}) {
  return (
    <section
      aria-label="Your Cart"
      className="overflow-hidden rounded-3xl border border-[#1d2a24]/10 bg-white/70 shadow-sm"
    >
      <div className="flex items-center justify-between border-b border-[#1d2a24]/10 px-5 py-4 sm:px-6">
        <div>
          <h3 className="text-sm font-semibold">Your Cart</h3>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#708176]">
            {current ? "Current Cart Summary" : "Historical Cart Summary"}
          </p>
        </div>
        <p className="text-xs text-[#708176]">
          {cart.totalQuantity} {cart.totalQuantity === 1 ? "unit" : "units"}
        </p>
      </div>

      {cart.items.length > 0 ? (
        <ol className="divide-y divide-[#1d2a24]/10">
          {cart.items.map((item) => {
          const priceChange = cart.priceChanges?.find(
            (change) => change.productId === item.productId,
          );
          return (
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
                  Current base price{" "}
                  {formatMoney(
                    item.priceComparison.currentBasePriceMinor,
                    cart.currency,
                  )}{" "}
                  — {item.priceComparison.direction.toLowerCase()}
                </p>
              ) : null}
              {priceChange ? (
                <p className="mt-1 text-sm font-medium text-amber-700">
                  Cart Price{" "}
                  {priceChange.direction.toLowerCase()} {" "}
                  from{" "}
                  {formatMoney(
                    priceChange.previousCartPriceMinor,
                    cart.currency,
                  )}{" "}
                  to{" "}
                  {formatMoney(
                    priceChange.currentCartPriceMinor,
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
              {itemError?.productId === item.productId ? (
                <p
                  role="alert"
                  className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
                >
                  {itemError.message}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-3 sm:justify-end">
              <p
                aria-label={`${item.productName} subtotal`}
                className="font-semibold tabular-nums"
              >
                {formatMoney(item.subtotalMinor, cart.currency)}
              </p>
              {current && onRemove ? (
                <button
                  type="button"
                  onClick={() => onRemove(item.productId)}
                  disabled={pendingProductId === item.productId}
                  className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-wait disabled:opacity-50"
                  aria-label={`Remove ${item.productName}`}
                >
                  Remove
                </button>
              ) : null}
            </div>
          </li>
          );
          })}
        </ol>
      ) : (
        <div className="px-5 py-7 text-center sm:px-6">
          <p className="font-semibold text-[#1d2a24]">Your Cart is empty.</p>
          {current && onDiscoverProducts ? (
            <button
              type="button"
              onClick={onDiscoverProducts}
              className="mt-4 rounded-full bg-[#1d2a24] px-4 py-2 text-sm font-semibold text-white"
            >
              Discover Products
            </button>
          ) : null}
        </div>
      )}

      <div className="flex items-center justify-between bg-[#eef1eb] px-5 py-4 sm:px-6">
        <p className="text-sm font-medium">Cart Subtotal</p>
        <p className="text-lg font-semibold tabular-nums">
          {formatMoney(cart.subtotalMinor, cart.currency)}
        </p>
      </div>
    </section>
  );
}
