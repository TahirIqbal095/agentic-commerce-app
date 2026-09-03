import { X } from "lucide-react";
import { formatMoney } from "@/lib/format-money";
import type {
  ProductConstraintKey,
  ShoppingIntent,
} from "@/modules/agent/intent";

export function ContextSummary({
  constraints,
  disabled,
  onRemove,
}: {
  constraints: ShoppingIntent;
  disabled: boolean;
  onRemove: (key: ProductConstraintKey) => void;
}) {
  const items: Array<{
    key: ProductConstraintKey;
    label: string;
    value: string;
  }> = [
    ...(constraints.productTypes.length
      ? [
          {
            key: "productTypes" as const,
            label: "Product type",
            value: constraints.productTypes.join(", "),
          },
        ]
      : []),
    ...(constraints.maxPriceMinor !== null
      ? [
          {
            key: "maxPriceMinor" as const,
            label: "Maximum price",
            value: formatMoney(constraints.maxPriceMinor, "INR"),
          },
        ]
      : []),
    ...(constraints.minPriceMinor !== null
      ? [
          {
            key: "minPriceMinor" as const,
            label: "Minimum price",
            value: formatMoney(constraints.minPriceMinor, "INR"),
          },
        ]
      : []),
    ...(constraints.category
      ? [
          {
            key: "category" as const,
            label: "Category",
            value: constraints.category,
          },
        ]
      : []),
    ...(constraints.size
      ? [{ key: "size" as const, label: "Size", value: constraints.size }]
      : []),
    ...(constraints.features.length
      ? [
          {
            key: "features" as const,
            label: "Features",
            value: constraints.features.join(", "),
          },
        ]
      : []),
    ...(constraints.useCases.length
      ? [
          {
            key: "useCases" as const,
            label: "Use cases",
            value: constraints.useCases.join(", "),
          },
        ]
      : []),
    ...(Object.keys(constraints.attributes).length
      ? [
          {
            key: "attributes" as const,
            label: "Product details",
            value: Object.entries(constraints.attributes)
              .map(([key, value]) => `${key}: ${String(value)}`)
              .join(", "),
          },
        ]
      : []),
    ...(constraints.inStockOnly
      ? [
          {
            key: "inStockOnly" as const,
            label: "Availability",
            value: "In stock",
          },
        ]
      : []),
  ];
  if (items.length === 0) return null;

  return (
    <aside
      aria-label="Context Summary"
      className="mb-8 rounded-lg border-2 border-sidebar-border bg-card p-4 text-card-foreground sm:p-5"
    >
      <div className="mb-3 flex items-center justify-between gap-4">
        <p className="eyebrow text-[10px] font-bold text-muted-foreground">
          Active preferences
        </p>
        <p className="eyebrow text-[10px] text-muted-foreground">
          {`${items.length} active ${items.length === 1 ? "preference" : "preferences"}`}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            disabled={disabled}
            aria-label={`Remove ${item.label.toLowerCase()} constraint`}
            onClick={() => onRemove(item.key)}
            className="inline-flex min-h-8 max-w-full items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-left text-xs leading-5 text-foreground transition-colors hover:bg-muted disabled:opacity-50 motion-reduce:transition-none"
          >
            <span>
              {item.label}: {item.value}
            </span>
            <X aria-hidden="true" className="size-3 shrink-0" />
          </button>
        ))}
      </div>
    </aside>
  );
}
