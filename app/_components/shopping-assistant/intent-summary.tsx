import { Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format-money";
import type { ShoppingIntent } from "./types";

export function IntentSummary({ intent }: { intent: ShoppingIntent }) {
  const labels = [
    ...intent.productTypes,
    ...intent.features,
    ...(intent.category ? [intent.category] : []),
    ...(intent.minPriceMinor !== null
      ? [`From ${formatMoney(intent.minPriceMinor, "INR")}`]
      : []),
    ...(intent.maxPriceMinor !== null
      ? [`Up to ${formatMoney(intent.maxPriceMinor, "INR")}`]
      : []),
  ];

  if (labels.length === 0) return null;

  return (
    <div className="flex max-w-2xl flex-wrap gap-2">
      {labels.map((label) => (
        <Badge
          key={label}
          variant="outline"
          className="border-[#1d2a24]/10 bg-white/45 font-normal text-[#526158]"
        >
          <Check className="size-3" /> {label}
        </Badge>
      ))}
    </div>
  );
}
