"use client";

import { useState, type FormEvent } from "react";

import { Composer } from "./_components/shopping-assistant/composer";
import { Header } from "./_components/shopping-assistant/header";
import { Hero } from "./_components/shopping-assistant/hero";
import { ProductDetails } from "./_components/shopping-assistant/product-details";
import { ResultArea } from "./_components/shopping-assistant/result-area";
import type { AgentResult } from "./_components/shopping-assistant/types";
import { cn } from "@/lib/utils";
import type { CatalogProduct } from "@/modules/catalog/catalog";

type AgentApiResponse = { data: AgentResult } | { error: { message: string } };

export function ShoppingAssistant() {
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<AgentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [submittedMessage, setSubmittedMessage] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] =
    useState<CatalogProduct | null>(null);

  async function submitPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = prompt.trim();
    if (!message || isLoading) return;

    setSubmittedMessage(message);
    setPrompt("");
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
      <div
        className="pointer-events-none fixed inset-0 overflow-hidden"
        aria-hidden="true"
      >
        <div className="absolute left-1/2 top-[-28rem] size-[48rem] -translate-x-1/2 rounded-full bg-white/80 blur-3xl" />
        <div className="absolute bottom-[-20rem] right-[-18rem] size-[38rem] rounded-full bg-[#dce5db]/50 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 pb-52 pt-5 sm:px-8 sm:pb-56 sm:pt-7">
        <Header />

        <div
          className={cn(
            "mx-auto flex w-full max-w-4xl flex-1 flex-col py-14 sm:py-20",
            !result && !isLoading && !error
              ? "justify-center"
              : "justify-start",
          )}
        >
          {!result && !isLoading && !error ? (
            <Hero onSuggestion={setPrompt} />
          ) : (
            <ResultArea
              error={error}
              isLoading={isLoading}
              onViewProduct={setSelectedProduct}
              result={result}
              submittedMessage={submittedMessage}
            />
          )}
        </div>
      </div>

      {selectedProduct ? (
        <ProductDetails
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
        />
      ) : null}

      <Composer
        prompt={prompt}
        setPrompt={setPrompt}
        isLoading={isLoading}
        onSubmit={submitPrompt}
      />
    </main>
  );
}
