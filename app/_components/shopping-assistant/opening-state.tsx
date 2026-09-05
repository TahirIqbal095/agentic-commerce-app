import { Radio } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EXAMPLE_PROMPTS } from "./brand-presentation";

/**
 * The Storefront before a Customer has said anything.
 *
 * The largest text on the page is the Brand's own description, so a Customer
 * arriving for the first time can answer "what is sold here?" without
 * experimenting. The Storefront invents no pitch of its own: change the Brand
 * record and this changes with it.
 */
export function OpeningState({
  brandName,
  brandDescription,
  onSuggestion,
}: {
  brandName: string;
  brandDescription: string;
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
      <h1 className="text-balance text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
        {brandDescription}
      </h1>
      <p className="mx-auto mt-8 max-w-xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
        Describe the need, the mood, or the budget. I&apos;ll turn it into a
        thoughtful shortlist from {brandName}&apos;s live Catalog.
      </p>

      <div className="mt-9 flex flex-wrap justify-center gap-3">
        {EXAMPLE_PROMPTS.map((prompt, index) => (
          <motion.div
            key={prompt}
            initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduceMotion ? 0 : 0.1 + index * 0.04 }}
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onSuggestion(prompt)}
            >
              {prompt}
            </Button>
          </motion.div>
        ))}
      </div>
    </motion.section>
  );
}
