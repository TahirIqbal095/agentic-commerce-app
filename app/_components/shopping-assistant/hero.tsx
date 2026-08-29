import { motion, useReducedMotion } from "motion/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const suggestions = [
  "Road-running shoes under ₹5,000",
  "Comfortable shoes for travel",
  "Accessories for evening runs",
];

export function Hero({
  brandName,
  onSuggestion,
}: {
  brandName: string;
  onSuggestion: (suggestion: string) => void;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.section
      initial={{ opacity: 0, y: reduceMotion ? 0 : 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className="text-center"
    >
      <Badge
        variant="outline"
        className="mb-7 border-[#1d2a24]/10 bg-white/45 px-3 py-1.5 text-[#526158] shadow-sm shadow-[#1d2a24]/5"
      >
        <span className="size-1.5 rounded-full bg-[#57a773]" />
        {brandName} Commerce Agent online
      </Badge>
      <h1 className="text-balance text-5xl font-medium leading-[0.98] tracking-[-0.055em] sm:text-7xl lg:text-[5.25rem]">
        Find the thing that
        <span className="block font-serif italic font-normal text-[#708176]">
          feels just right.
        </span>
      </h1>
      <p className="mx-auto mt-7 max-w-xl text-pretty text-base leading-7 text-[#6d766f] sm:text-lg">
        Describe the need, the mood, or the budget. I&apos;ll turn it into a
        thoughtful shortlist from {brandName}&apos;s live Catalog.
      </p>

      <div className="mt-9 flex flex-wrap justify-center gap-2">
        {suggestions.map((suggestion, index) => (
          <motion.div
            key={suggestion}
            initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduceMotion ? 0 : 0.16 + index * 0.06 }}
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onSuggestion(suggestion)}
              className="rounded-full border-[#1d2a24]/10 bg-white/45 font-normal text-[#526158] shadow-none hover:-translate-y-0.5 hover:bg-white hover:shadow-sm"
            >
              {suggestion}
            </Button>
          </motion.div>
        ))}
      </div>
    </motion.section>
  );
}
