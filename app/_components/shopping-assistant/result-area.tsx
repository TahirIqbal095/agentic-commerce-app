import { PackageSearch } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { Card, CardContent } from "@/components/ui/card";
import type { CatalogProduct } from "@/modules/catalog/catalog";
import { AgentMessage } from "./agent-message";
import { AgentProgress } from "./agent-progress";
import { CustomerMessage } from "./customer-message";
import { IntentSummary } from "./intent-summary";
import { ProductCard } from "./product-card";
import type { AgentResult } from "./types";

export function ResultArea({
  error,
  isLoading,
  onViewProduct,
  result,
  submittedMessage,
}: {
  error: string | null;
  isLoading: boolean;
  onViewProduct: (product: CatalogProduct) => void;
  result: AgentResult | null;
  submittedMessage: string | null;
}) {
  const reduceMotion = useReducedMotion();
  const intent = result?.intentBrief?.constraints ?? result?.intent;

  return (
    <section
      aria-live="polite"
      aria-busy={isLoading}
      className="w-full space-y-7"
    >
      {submittedMessage ? <CustomerMessage message={submittedMessage} /> : null}

      <AnimatePresence initial={false}>
        {isLoading ? (
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

        {error ? (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <AgentMessage>
              <div className="rounded-2xl border border-red-200 bg-red-50/90 px-5 py-4 text-sm text-red-700">
                {error}
              </div>
            </AgentMessage>
          </motion.div>
        ) : null}

        {result && !isLoading ? (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <AgentMessage>
              <div className="mb-8 flex flex-col gap-5">
                <p className="max-w-3xl text-balance text-2xl font-medium leading-snug tracking-[-0.025em] sm:text-3xl">
                  {result.message}
                </p>
                {intent ? (
                  <IntentSummary intent={intent} />
                ) : null}
              </div>

              {result.products.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {result.products.map((product, index) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      index={index}
                      onView={() => onViewProduct(product)}
                    />
                  ))}
                </div>
              ) : (
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
    </section>
  );
}
