import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";
import type { CatalogProduct } from "@/modules/catalog/catalog";
import { AgentMessage } from "./agent-message";
import { AgentProgress } from "./agent-progress";
import { CustomerMessage } from "./customer-message";
import { IntentSummary } from "./intent-summary";
import { RecommendationCarousel } from "./recommendation-carousel";
import type { ConversationTurn } from "./types";

export function ResultArea({
  isLoading,
  onViewProduct,
  turns,
}: {
  isLoading: boolean;
  onViewProduct: (product: CatalogProduct) => void;
  turns: ConversationTurn[];
}) {
  const reduceMotion = useReducedMotion();

  return (
    <section
      aria-live="polite"
      aria-busy={isLoading}
      className="w-full space-y-7"
    >
      {turns.map((turn) => {
        const intent =
          turn.result?.intentBrief?.constraints ?? turn.result?.intent;
        const isPending =
          isLoading && turn.result === null && turn.error === null;
        const isNeedsInput = turn.result?.status === "NEEDS_INPUT";

        return (
          <div key={turn.id} className="space-y-7">
            <CustomerMessage message={turn.customerMessage} />

            <AnimatePresence initial={false}>
              {isPending ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                >
                  <AgentMessage>
                    <AgentProgress />
                  </AgentMessage>
                </motion.div>
              ) : null}

              {turn.error ? (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <AgentMessage>
                    <div className="rounded-2xl border border-red-200 bg-red-50/90 px-5 py-4 text-sm text-red-700">
                      {turn.error}
                    </div>
                  </AgentMessage>
                </motion.div>
              ) : null}

              {turn.result ? (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                >
                  <AgentMessage>
                    <div className="mb-8 flex flex-col gap-5">
                      <p
                        className={cn(
                          "max-w-3xl text-balance font-medium",
                          isNeedsInput
                            ? "text-base leading-7 sm:text-lg"
                            : "text-2xl leading-snug tracking-[-0.025em] sm:text-3xl",
                        )}
                      >
                        {turn.result.message}
                      </p>
                      {intent && !isNeedsInput ? (
                        <IntentSummary intent={intent} />
                      ) : null}
                    </div>

                    {turn.result.products.length > 0 ? (
                      <RecommendationCarousel
                        products={turn.result.products}
                        onViewProduct={onViewProduct}
                      />
                    ) : null}
                  </AgentMessage>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        );
      })}
    </section>
  );
}
