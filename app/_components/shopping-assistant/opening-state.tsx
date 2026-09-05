import type { ReactNode } from "react";
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
 *
 * The composer sits directly beneath the headline rather than at the viewport's
 * edge, because the one control that does anything belongs where the Customer
 * is already looking. Under it are examples written as whole requests, so a
 * Customer learns that a use case, a budget, or a mood is a thing they may say.
 * Tapping one starts a Conversation Turn rather than filling the composer and
 * leaving them to find the send control.
 */
export function OpeningState({
  brandName,
  brandDescription,
  composer,
  onPrompt,
}: {
  brandName: string;
  brandDescription: string;
  composer: ReactNode;
  onPrompt: (message: string) => void;
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

      <div className="mx-auto mt-10 w-full max-w-3xl">{composer}</div>

      <div
        role="group"
        aria-label="Example prompts"
        className="mt-7 flex flex-wrap justify-center gap-3"
      >
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
              onClick={() => onPrompt(prompt)}
            >
              {prompt}
            </Button>
          </motion.div>
        ))}
      </div>
    </motion.section>
  );
}
