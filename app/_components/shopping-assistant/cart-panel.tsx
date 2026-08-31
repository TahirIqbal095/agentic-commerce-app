import { useState, type KeyboardEvent } from "react";
import { formatMoney } from "@/lib/format-money";
import type { CartQuantityChange, CartView } from "@/modules/cart/cart";

export function CartPanel({
  cart,
  current = false,
  onDiscoverProducts,
  onRemove,
  onChangeQuantity,
  onClear,
  pendingProductId,
  cartPending = false,
  itemError,
}: {
  cart: CartView;
  current?: boolean;
  onDiscoverProducts?: () => void;
  onRemove?: (productId: string) => void;
  onChangeQuantity?: (productId: string, change: CartQuantityChange) => void;
  onClear?: () => void;
  pendingProductId?: string | null;
  cartPending?: boolean;
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
          const incrementLimit = item.productActive === false
            ? item.quantity
            : Math.min(10, item.availableQuantity ?? 10);
          const pending = cartPending || pendingProductId === item.productId;
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
            <div className="flex flex-wrap items-center gap-3 sm:justify-end">
              {current && onChangeQuantity ? (
                <QuantityControls
                  key={`${item.productId}:${item.quantity}`}
                  productId={item.productId}
                  productName={item.productName}
                  quantity={item.quantity}
                  incrementLimit={incrementLimit}
                  pending={pending}
                  onChange={onChangeQuantity}
                />
              ) : null}
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
                  disabled={pending}
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

      <div className="flex items-center justify-between gap-4 bg-[#eef1eb] px-5 py-4 sm:px-6">
        {current && cart.items.length > 0 && onClear ? (
          <button
            type="button"
            onClick={onClear}
            disabled={cartPending || Boolean(pendingProductId)}
            className="rounded-full border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 disabled:cursor-wait disabled:opacity-50"
          >
            Clear Cart
          </button>
        ) : <span />}
        <div className="text-right">
        <p className="text-sm font-medium">Cart Subtotal</p>
        <p className="text-lg font-semibold tabular-nums">
          {formatMoney(cart.subtotalMinor, cart.currency)}
        </p>
        </div>
      </div>
    </section>
  );
}

function QuantityControls({
  productId,
  productName,
  quantity,
  incrementLimit,
  pending,
  onChange,
}: {
  productId: string;
  productName: string;
  quantity: number;
  incrementLimit: number;
  pending: boolean;
  onChange: (productId: string, change: CartQuantityChange) => void;
}) {
  const [draft, setDraft] = useState(String(quantity));
  const [validationError, setValidationError] = useState<string | null>(null);
  const exactQuantityLimit = Math.max(quantity, incrementLimit);

  function submitExactQuantity() {
    const validWholeNumber = /^\d+$/.test(draft);
    const nextQuantity = Number(draft);
    if (
      !validWholeNumber ||
      !Number.isInteger(nextQuantity) ||
      nextQuantity < 1 ||
      nextQuantity > exactQuantityLimit
    ) {
      setDraft(String(quantity));
      setValidationError(
        `Enter a whole quantity from 1 to ${exactQuantityLimit}.`,
      );
      return;
    }
    setValidationError(null);
    if (nextQuantity !== quantity) {
      onChange(productId, { mode: "EXACT", quantity: nextQuantity });
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    submitExactQuantity();
  }

  return (
    <div>
      <div className="flex items-center gap-2" aria-busy={pending}>
        <button
          type="button"
          aria-label={`Decrease ${productName} quantity`}
          disabled={pending || quantity <= 1}
          onClick={() => {
            setValidationError(null);
            onChange(productId, { mode: "RELATIVE", quantity: -1 });
          }}
          className="size-8 rounded-full border border-[#1d2a24]/20 font-semibold disabled:opacity-40"
        >
          −
        </button>
        <input
          type="number"
          aria-label={`${productName} quantity`}
          aria-invalid={validationError ? true : undefined}
          value={draft}
          min={1}
          max={exactQuantityLimit}
          step={1}
          disabled={pending}
          onChange={(event) => {
            setDraft(event.currentTarget.value);
            setValidationError(null);
          }}
          onBlur={submitExactQuantity}
          onKeyDown={handleKeyDown}
          className="h-8 w-14 rounded-lg border border-[#1d2a24]/20 bg-white text-center text-sm font-semibold"
        />
        <button
          type="button"
          aria-label={`Increase ${productName} quantity`}
          disabled={pending || quantity >= incrementLimit}
          onClick={() => {
            setValidationError(null);
            onChange(productId, { mode: "RELATIVE", quantity: 1 });
          }}
          className="size-8 rounded-full border border-[#1d2a24]/20 font-semibold disabled:opacity-40"
        >
          +
        </button>
      </div>
      {validationError ? (
        <p role="alert" className="mt-2 max-w-52 text-xs font-medium text-red-700">
          {validationError}
        </p>
      ) : null}
    </div>
  );
}
