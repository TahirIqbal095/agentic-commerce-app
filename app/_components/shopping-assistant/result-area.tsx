import { PackageSearch } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { Card, CardContent } from "@/components/ui/card";
import type { CatalogProduct } from "@/modules/catalog/catalog";
import { AgentMessage } from "./agent-message";
import { AgentProgress } from "./agent-progress";
import { CustomerMessage } from "./customer-message";
import { IntentSummary } from "./intent-summary";
import { ProductCard } from "./product-card";
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
                      <p className="max-w-3xl text-balance text-2xl font-medium leading-snug tracking-[-0.025em] sm:text-3xl">
                        {turn.result.message}
                      </p>
                      {intent ? <IntentSummary intent={intent} /> : null}
                    </div>

                    {turn.result.products.length > 0 ? (
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {turn.result.products.map((product, index) => (
                          <ProductCard
                            key={product.id}
                            product={product}
                            index={index}
                            onView={() => onViewProduct(product)}
                          />
                        ))}
                      </div>
                    ) : turn.result.cart ? null : (
                      <Card className="border-[#1d2a24]/10 border-dashed bg-white/35 py-10 text-center shadow-none">
                        <CardContent className="pb-0">
                          <PackageSearch className="mx-auto mb-4 size-7 opacity-50" />
                          <p>No close matches yet. Try broadening the request.</p>
                        </CardContent>
                      </Card>
                    )}
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
