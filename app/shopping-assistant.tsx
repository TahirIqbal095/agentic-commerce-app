"use client";

import { useState, type FormEvent } from "react";
import type { CatalogProduct } from "@/modules/catalog/catalog";
import { formatMoney } from "@/lib/format-money";

type AgentResult = {
  message: string;
  products: CatalogProduct[];
};

type AgentApiResponse = { data: AgentResult } | { error: { message: string } };

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
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100 sm:px-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-400">
            Agentic Commerce
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
            What would you like to discover?
          </h1>
          <p className="max-w-2xl text-base leading-7 text-slate-400">
            Ask the shopping assistant to browse the merchant&apos;s live
            catalog. Product details, prices, and availability come directly
            from the commerce system.
          </p>
        </header>

        <form
          onSubmit={submitPrompt}
          className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-3 shadow-2xl shadow-emerald-950/20 sm:flex-row"
        >
          <label htmlFor="shopping-prompt" className="sr-only">
            Message the shopping assistant
          </label>
          <input
            id="shopping-prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Try “show me products”"
            autoComplete="off"
            className="min-w-0 flex-1 rounded-xl bg-slate-950 px-4 py-3 text-base outline-none ring-emerald-400 placeholder:text-slate-600 focus:ring-2"
          />
          <button
            type="submit"
            disabled={isLoading || prompt.trim().length === 0}
            className="rounded-xl bg-emerald-400 px-6 py-3 font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          >
            {isLoading ? "Searching…" : "Send"}
          </button>
        </form>

        <section aria-live="polite" aria-busy={isLoading}>
          {error ? (
            <p className="rounded-xl border border-red-900 bg-red-950/50 px-4 py-3 text-red-200">
              {error}
            </p>
          ) : null}

          {result ? (
            <div className="space-y-5">
              <p className="max-w-2xl rounded-2xl rounded-tl-sm bg-slate-800 px-5 py-4 text-slate-200">
                {result.message}
              </p>

              {result.products.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {result.products.map((product) => (
                    <article
                      key={product.id}
                      className="flex min-h-64 flex-col rounded-2xl border border-slate-800 bg-slate-900 p-5"
                    >
                      <div className="mb-8 flex items-start justify-between gap-3">
                        <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-medium text-slate-300">
                          {product.category}
                        </span>
                        <span
                          className={
                            product.inStock
                              ? "text-xs font-medium text-emerald-400"
                              : "text-xs font-medium text-amber-400"
                          }
                        >
                          {product.inStock ? "In stock" : "Out of stock"}
                        </span>
                      </div>
                      <h2 className="text-xl font-semibold text-white">
                        {product.name}
                      </h2>
                      <p className="mt-2 flex-1 text-sm leading-6 text-slate-400">
                        {product.description}
                      </p>
                      <p className="mt-5 text-2xl font-semibold text-emerald-300">
                        {formatMoney(product.priceMinor, product.currency)}
                      </p>
                    </article>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
