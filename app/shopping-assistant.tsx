"use client";

import { useState, type FormEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  ArrowUp,
  Check,
  Headphones,
  PackageSearch,
  ShoppingBag,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/format-money";
import { cn } from "@/lib/utils";
import type { CatalogProduct } from "@/modules/catalog/catalog";

type ShoppingIntent = {
  productTypes: string[];
  features: string[];
  category: string | null;
  minPriceMinor: number | null;
  maxPriceMinor: number | null;
};

type AgentResult = {
  message: string;
  intent?: ShoppingIntent;
  products: CatalogProduct[];
};

type AgentApiResponse = { data: AgentResult } | { error: { message: string } };

const suggestions = [
  "Everyday headphones under ₹5,000",
  "A minimal desk upgrade",
  "Something useful for travel",
];

export function ShoppingAssistant() {
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<AgentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function submitPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = prompt.trim();
    if (!message || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/agent/message", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const payload = (await response.json()) as AgentApiResponse;

      if (!response.ok || !("data" in payload)) {
        throw new Error(
          "error" in payload
            ? payload.error.message
            : "The assistant could not respond.",
        );
      }

      setResult(payload.data);
      setPrompt("");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The assistant could not respond.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f1eb] text-[#1d2a24]">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute left-1/2 top-[-28rem] size-[48rem] -translate-x-1/2 rounded-full bg-white/80 blur-3xl" />
        <div className="absolute bottom-[-20rem] right-[-18rem] size-[38rem] rounded-full bg-[#dce5db]/50 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 pb-52 pt-5 sm:px-8 sm:pb-56 sm:pt-7">
        <Header />

        <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center py-14 sm:py-20">
          {!result && !isLoading && !error ? (
            <Hero onSuggestion={setPrompt} />
          ) : (
            <ResultArea
              error={error}
              isLoading={isLoading}
              result={result}
            />
          )}
        </div>
      </div>

      <Composer
        prompt={prompt}
        setPrompt={setPrompt}
        isLoading={isLoading}
        onSubmit={submitPrompt}
      />
    </main>
  );
}

function Header() {
  return (
    <header className="flex items-center justify-between">
      <div className="flex items-center gap-2.5" aria-label="Arc shopping assistant">
        <span className="grid size-9 place-items-center rounded-xl bg-[#1d2a24] text-white shadow-sm">
          <Sparkles className="size-4" />
        </span>
        <span className="text-sm font-semibold tracking-[-0.02em]">arc</span>
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
          <ShoppingBag /> Cart · 0
        </Button>
      </div>
    </header>
  );
}

function Hero({ onSuggestion }: { onSuggestion: (suggestion: string) => void }) {
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
        Catalog assistant online
      </Badge>
      <h1 className="text-balance text-5xl font-medium leading-[0.98] tracking-[-0.055em] sm:text-7xl lg:text-[5.25rem]">
        Find the thing that
        <span className="block font-serif italic font-normal text-[#708176]">
          feels just right.
        </span>
      </h1>
      <p className="mx-auto mt-7 max-w-xl text-pretty text-base leading-7 text-[#6d766f] sm:text-lg">
        Describe the need, the mood, or the budget. I&apos;ll turn it into a
        thoughtful shortlist from the live catalog.
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

function Composer({
  prompt,
  setPrompt,
  isLoading,
  onSubmit,
}: {
  prompt: string;
  setPrompt: (prompt: string) => void;
  isLoading: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 bg-gradient-to-t from-[#f4f1eb] via-[#f4f1eb]/95 to-transparent px-4 pb-4 pt-16 sm:pb-6 sm:pt-20">
      <motion.form
        onSubmit={onSubmit}
        initial={{ opacity: 0, y: reduceMotion ? 0 : 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
        className="group relative mx-auto w-full max-w-3xl rounded-[1.65rem] border border-[#1d2a24]/10 bg-white/88 p-2 shadow-[0_24px_70px_-24px_rgba(29,42,36,0.38)] backdrop-blur-2xl transition-[border-color,box-shadow] duration-300 focus-within:border-[#708176]/45 focus-within:shadow-[0_28px_80px_-24px_rgba(29,42,36,0.48)]"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-8 -top-px h-px bg-gradient-to-r from-transparent via-white to-transparent"
        />

        <div className="flex items-end gap-2">
          <div className="flex min-w-0 flex-1 items-start gap-3 pl-3">
            <span className="mt-3.5 grid size-7 shrink-0 place-items-center rounded-lg bg-[#e8ece6] text-[#526158] transition-colors group-focus-within:bg-[#1d2a24] group-focus-within:text-white">
              <Sparkles className="size-3.5" />
            </span>
            <label htmlFor="shopping-prompt" className="sr-only">
              Message the shopping assistant
            </label>
            <Textarea
              id="shopping-prompt"
              value={prompt}
              rows={1}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="What are you looking for?"
              autoComplete="off"
              className="max-h-36 min-h-14 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-0 py-3.5 text-[15px] leading-6 text-[#1d2a24] shadow-none field-sizing-content placeholder:text-[#8c958f] focus-visible:ring-0"
            />
          </div>

          <Button
            type="submit"
            size="icon"
            disabled={isLoading || prompt.trim().length === 0}
            aria-label={isLoading ? "Searching catalog" : "Send"}
            className="mb-1 size-12 shrink-0 rounded-2xl bg-[#1d2a24] text-white shadow-lg shadow-[#1d2a24]/15 transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#31463a] hover:shadow-xl disabled:translate-y-0 disabled:bg-[#dfe3df] disabled:text-[#9da49f] disabled:shadow-none"
          >
            {isLoading ? (
              <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <ArrowUp className="size-5" />
            )}
          </Button>
        </div>

        <div className="flex items-center justify-between px-3 pb-1.5 pt-1 text-[11px] text-[#8c958f]">
          <span className="flex items-center gap-1.5">
            <span className="size-1 rounded-full bg-[#57a773]" />
            Searches the live merchant catalog
          </span>
          <span className="hidden sm:inline">Be specific or wonderfully vague</span>
        </div>
      </motion.form>
    </div>
  );
}

function ResultArea({
  error,
  isLoading,
  result,
}: {
  error: string | null;
  isLoading: boolean;
  result: AgentResult | null;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <section aria-live="polite" aria-busy={isLoading} className="w-full">
      <AnimatePresence initial={false}>
        {isLoading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex min-h-72 flex-col items-center justify-center gap-5 text-center"
          >
            <motion.div
              animate={reduceMotion ? undefined : { rotate: 360 }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
              className="grid size-14 place-items-center rounded-2xl border border-[#1d2a24]/5 bg-white/70 text-[#1d2a24] shadow-sm"
            >
              <Sparkles />
            </motion.div>
            <div>
              <p className="font-medium">Reading the catalog</p>
              <p className="mt-1 text-sm text-[#778079]">
                Looking for the strongest matches…
              </p>
            </div>
          </motion.div>
        ) : null}

        {error ? (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-red-200 bg-red-50/90 px-5 py-4 text-sm text-red-700 shadow-sm"
          >
            {error}
          </motion.div>
        ) : null}

        {result && !isLoading ? (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="mb-8 flex flex-col gap-6">
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#708176]">
                  Curated response
                </p>
                <p className="max-w-3xl text-balance text-2xl font-medium leading-snug tracking-[-0.025em] sm:text-3xl">
                  {result.message}
                </p>
              </div>
              {result.intent ? <IntentSummary intent={result.intent} /> : null}
            </div>

            {result.products.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {result.products.map((product, index) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    index={index}
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
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

function IntentSummary({ intent }: { intent: ShoppingIntent }) {
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

function ProductCard({
  product,
  index,
}: {
  product: CatalogProduct;
  index: number;
}) {
  const reduceMotion = useReducedMotion();
  const icon = index % 2 === 0 ? <Headphones /> : <ShoppingBag />;

  return (
    <motion.article
      initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: reduceMotion ? 0 : index * 0.06 }}
      whileHover={reduceMotion ? undefined : { y: -3 }}
    >
      <Card className="h-full overflow-hidden border-[#1d2a24]/10 bg-white/62 shadow-none transition-shadow hover:shadow-xl hover:shadow-[#1d2a24]/8">
        <div className="grid aspect-[1.65] place-items-center border-b border-[#1d2a24]/5 bg-[#e5e1d8] text-[#708176] [&_svg]:size-16 [&_svg]:stroke-[0.75]">
          {icon}
        </div>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <Badge
              variant="outline"
              className="border-[#1d2a24]/10 bg-white/40 font-normal text-[#526158]"
            >
              {product.category}
            </Badge>
            <span
              className={cn(
                "flex items-center gap-1.5 text-xs",
                product.inStock ? "text-emerald-700" : "text-amber-700",
              )}
            >
              <span className="size-1.5 rounded-full bg-current" />
              {product.inStock ? "In stock" : "Unavailable"}
            </span>
          </div>
          <h2 className="pt-3 text-xl font-semibold tracking-[-0.025em]">
            {product.name}
          </h2>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col">
          <p className="line-clamp-2 flex-1 text-sm leading-6 text-[#6d766f]">
            {product.description}
          </p>
          <div className="mt-6 flex items-center justify-between">
            <p className="text-lg font-semibold">
              {formatMoney(product.priceMinor, product.currency)}
            </p>
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label={`View ${product.name}`}
              className="rounded-full border-[#1d2a24]/10 bg-white/40 text-[#1d2a24] shadow-none hover:bg-[#1d2a24] hover:text-white"
            >
              <ArrowRight />
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.article>
  );
}
