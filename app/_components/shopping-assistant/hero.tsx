import { Radio } from "lucide-react";
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
      initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.25 }}
      className="text-center"
    >
      <Badge variant="outline" className="mb-7">
        <Radio aria-hidden="true" className="text-secondary" />
        {brandName} Commerce Agent online
      </Badge>
      {/*
        The theme maps its serif token to the same family as its sans token, so
        the second line can no longer earn its contrast from an italic serif.
        It is carried by a filled accent block instead, which keeps the
        two-part headline structure the hero is built on.
      */}
      <h1 className="text-balance text-5xl font-bold leading-[1.02] tracking-tight sm:text-7xl lg:text-[5.25rem]">
        Find the thing that
        <span className="mt-3 block">
          <span className="inline-block rounded-md border-2 border-sidebar-border bg-accent px-4 py-1 text-accent-foreground">
            feels just right.
          </span>
        </span>
      </h1>
      <p className="mx-auto mt-8 max-w-xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
        Describe the need, the mood, or the budget. I&apos;ll turn it into a
        thoughtful shortlist from {brandName}&apos;s live Catalog.
      </p>

      <div className="mt-9 flex flex-wrap justify-center gap-3">
        {suggestions.map((suggestion, index) => (
          <motion.div
            key={suggestion}
            initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduceMotion ? 0 : 0.1 + index * 0.04 }}
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onSuggestion(suggestion)}
            >
              {suggestion}
            </Button>
          </motion.div>
        ))}
      </div>
    </motion.section>
  );
}
