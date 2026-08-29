import { ShoppingBag, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

export function Header({
  brandName,
  cartQuantity,
}: {
  brandName: string;
  cartQuantity: number;
}) {
  return (
    <header className="flex items-center justify-between">
      <div
        className="flex items-center gap-2.5"
        aria-label={`${brandName} Storefront`}
      >
        <span className="grid size-9 place-items-center rounded-xl bg-[#1d2a24] text-white shadow-sm">
          <Sparkles className="size-4" />
        </span>
        <span className="text-sm font-semibold tracking-[-0.02em]">
          {brandName}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <span className="hidden items-center gap-2 text-xs text-[#6d766f] sm:flex">
          <span className="size-1.5 rounded-full bg-[#57a773] shadow-[0_0_0_3px_rgba(87,167,115,0.12)]" />
          Live catalog
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-full border-[#1d2a24]/10 bg-white/45 text-[#39483f] shadow-none hover:bg-white"
        >
          <ShoppingBag /> Cart · {cartQuantity}
        </Button>
      </div>
    </header>
  );
}
