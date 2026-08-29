import { X } from "lucide-react";
import { formatMoney } from "@/lib/format-money";
import type { ProductConstraintKey, ShoppingIntent } from "@/modules/agent/types";

export function ContextSummary({
  constraints,
  disabled,
  onRemove,
}: {
  constraints: ShoppingIntent;
  disabled: boolean;
  onRemove: (key: ProductConstraintKey) => void;
}) {
  const items: Array<{ key: ProductConstraintKey; label: string; value: string }> = [
    ...(constraints.productTypes.length
      ? [{ key: "productTypes" as const, label: "Product type", value: constraints.productTypes.join(", ") }]
      : []),
    ...(constraints.maxPriceMinor !== null
      ? [{ key: "maxPriceMinor" as const, label: "Maximum price", value: formatMoney(constraints.maxPriceMinor, "INR") }]
      : []),
    ...(constraints.minPriceMinor !== null
      ? [{ key: "minPriceMinor" as const, label: "Minimum price", value: formatMoney(constraints.minPriceMinor, "INR") }]
      : []),
    ...(constraints.category
      ? [{ key: "category" as const, label: "Category", value: constraints.category }]
      : []),
    ...(constraints.size
      ? [{ key: "size" as const, label: "Size", value: constraints.size }]
      : []),
    ...(constraints.features.length
      ? [{ key: "features" as const, label: "Features", value: constraints.features.join(", ") }]
      : []),
    ...(constraints.useCases.length
      ? [{ key: "useCases" as const, label: "Use cases", value: constraints.useCases.join(", ") }]
      : []),
    ...(Object.keys(constraints.attributes).length
      ? [{
          key: "attributes" as const,
          label: "Product details",
          value: Object.entries(constraints.attributes)
            .map(([key, value]) => `${key}: ${String(value)}`)
            .join(", "),
        }]
      : []),
    ...(constraints.inStockOnly
      ? [{ key: "inStockOnly" as const, label: "Availability", value: "In stock" }]
      : []),
  ];
  if (items.length === 0) return null;

  return (
    <aside aria-label="Context Summary" className="mb-8 rounded-2xl border border-[#1d2a24]/10 bg-white/45 p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#708176]">Active preferences</p>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            disabled={disabled}
            aria-label={`Remove ${item.label.toLowerCase()} constraint`}
            onClick={() => onRemove(item.key)}
            className="inline-flex items-center gap-2 rounded-full border border-[#1d2a24]/10 bg-white px-3 py-1.5 text-xs text-[#526158]"
          >
            <span>{item.label}: {item.value}</span><X className="size-3" />
          </button>
        ))}
      </div>
    </aside>
  );
}
