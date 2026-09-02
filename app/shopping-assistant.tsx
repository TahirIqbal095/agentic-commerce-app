"use client";

import { useEffect, useState, type FormEvent } from "react";

import { Composer } from "./_components/shopping-assistant/composer";
import { ContextSummary } from "./_components/shopping-assistant/context-summary";
import { Header } from "./_components/shopping-assistant/header";
import { Hero } from "./_components/shopping-assistant/hero";
import { ProductDetails } from "./_components/shopping-assistant/product-details";
import { ResultArea } from "./_components/shopping-assistant/result-area";
import type {
  AgentResult,
  CartFeedback,
  ConversationTurn,
  CurrentConversation,
} from "./_components/shopping-assistant/types";
import { formatMoney } from "@/lib/format-money";
import { cn } from "@/lib/utils";
import type { CartView } from "@/modules/cart/cart";
import type { CatalogProduct } from "@/modules/catalog/catalog";
import type {
  ProductConstraintKey,
  ShoppingIntent,
} from "@/modules/agent/intent";

type AgentApiResponse = { data: AgentResult } | { error: { message: string } };
type CartApiResponse =
  | { data: CartView }
  | { error: { message: string; details?: { cart?: CartView } } };

export function ShoppingAssistant({
  brandName,
  initialConversation = null,
  resumeConversation = false,
}: {
  brandName: string;
  initialConversation?: CurrentConversation | null;
  resumeConversation?: boolean;
}) {
  const [prompt, setPrompt] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(
    initialConversation?.conversationId ?? null,
  );
  const [turns, setTurns] = useState<ConversationTurn[]>(
    initialConversation?.transcript ?? [],
  );
  const [contextSummary, setContextSummary] = useState<ShoppingIntent | null>(
    initialConversation?.contextSummary ?? null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<CatalogProduct | null>(
    null,
  );
  const [cartQuantity, setCartQuantity] = useState(0);
  const [addingProductIds, setAddingProductIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [cartFeedback, setCartFeedback] = useState<
    Record<string, CartFeedback>
  >({});

  useEffect(() => {
    if (!resumeConversation) return;
    let active = true;
    void fetch("/api/agent/conversation")
      .then(async (response) => {
        if (!response.ok) return null;
        const payload = (await response.json()) as {
          data: CurrentConversation | null;
        };
        return payload.data;
      })
      .then((conversation) => {
        if (!active || !conversation) return;
        setConversationId(conversation.conversationId);
        setTurns(conversation.transcript);
        setContextSummary(conversation.contextSummary);
      })
      .catch(() => {});
    void fetch("/api/cart")
      .then(async (response) => {
        if (!response.ok) return null;
        const payload = (await response.json()) as {
          data: { totalQuantity: number };
        };
        return payload.data;
      })
      .then((cart) => {
        if (!active || !cart) return;
        setCartQuantity(cart.totalQuantity);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [resumeConversation]);

  async function submitPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = prompt.trim();
    if (!message || isLoading) return;
    setPrompt("");
    await sendMessage(message);
  }

  async function sendMessage(message: string) {
    const turnId = crypto.randomUUID();
    setTurns((currentTurns) => [
      ...currentTurns,
      { id: turnId, customerMessage: message, result: null, error: null },
    ]);
    setIsLoading(true);

    try {
      const response = await fetch("/api/agent/message", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(conversationId ? { conversationId } : {}),
          idempotencyKey: turnId,
          message,
        }),
      });
      const payload = (await response.json()) as AgentApiResponse;

      if (!response.ok || !("data" in payload)) {
        throw new Error(
          "error" in payload
            ? payload.error.message
            : "The assistant could not respond.",
        );
      }

      setTurns((currentTurns) =>
        currentTurns.map((turn) =>
          turn.id === turnId ? { ...turn, result: payload.data } : turn,
        ),
      );
      if (payload.data.conversationId) {
        setConversationId(payload.data.conversationId);
      }
      if (payload.data.cart) {
        setCartQuantity(payload.data.cart.totalQuantity);
      }
      const nextSummary =
        payload.data.intentBrief?.constraints ?? payload.data.intent;
      if (nextSummary) setContextSummary(nextSummary);
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "The assistant could not respond.";
      setTurns((currentTurns) =>
        currentTurns.map((turn) =>
          turn.id === turnId ? { ...turn, error: message } : turn,
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }

  function removeConstraint(key: ProductConstraintKey) {
    const messages: Record<ProductConstraintKey, string> = {
      productTypes: "Ignore the Product type",
      useCases: "Ignore the use case",
      features: "Ignore the requested features",
      category: "Ignore the category",
      minPriceMinor: "Ignore the minimum price",
      maxPriceMinor: "Ignore the maximum price",
      size: "Ignore the size",
      inStockOnly: "Include unavailable Products",
      attributes: "Ignore the Product details",
    };
    void sendMessage(messages[key]);
  }

  async function startNewConversation() {
    if (isLoading) return;
    const response = await fetch("/api/agent/conversation", {
      method: "DELETE",
    });
    if (!response.ok) return;
    setConversationId(null);
    setTurns([]);
    setContextSummary(null);
    setSelectedProduct(null);
  }

  async function addProduct(product: CatalogProduct) {
    if (addingProductIds.has(product.id)) return;
    setAddingProductIds((current) => new Set(current).add(product.id));
    setCartFeedback((current) => {
      const next = { ...current };
      delete next[product.id];
      return next;
    });

    try {
      const response = await fetch("/api/cart", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "ADD_PRODUCT",
          productId: product.id,
          mutationKey: crypto.randomUUID(),
        }),
      });
      const payload = (await response.json()) as CartApiResponse;
      if (!response.ok || !("data" in payload)) {
        if ("error" in payload && payload.error.details?.cart) {
          setCartQuantity(payload.error.details.cart.totalQuantity);
        }
        throw new Error(
          "error" in payload
            ? payload.error.message
            : `${product.name} could not be added.`,
        );
      }

      setCartQuantity(payload.data.totalQuantity);
      const item = payload.data.items.find(
        (cartItem) => cartItem.productId === product.id,
      );
      setCartFeedback((current) => ({
        ...current,
        [product.id]: {
          kind: "success",
          message: `${product.name} quantity: ${item?.quantity ?? 0}. Cart subtotal: ${formatMoney(payload.data.subtotalMinor, payload.data.currency)}.`,
        },
      }));
    } catch (requestError) {
      setCartFeedback((current) => ({
        ...current,
        [product.id]: {
          kind: "error",
          message:
            requestError instanceof Error
              ? requestError.message
              : `${product.name} could not be added.`,
        },
      }));
    } finally {
      setAddingProductIds((current) => {
        const next = new Set(current);
        next.delete(product.id);
        return next;
      });
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f1eb] text-[#1d2a24]">
      <div
        className="pointer-events-none fixed inset-0 overflow-hidden"
        aria-hidden="true"
      >
        <div className="absolute left-1/2 -top-112 size-192 -translate-x-1/2 rounded-full bg-white/80 blur-3xl" />
        <div className="absolute -bottom-80 -right-72 size-152 rounded-full bg-[#dce5db]/50 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 pb-52 pt-5 sm:px-8 sm:pb-56 sm:pt-7">
        <Header
          brandName={brandName}
          cartQuantity={cartQuantity}
          hasConversation={turns.length > 0}
          onNewConversation={startNewConversation}
        />

        <div
          className={cn(
            "mx-auto flex w-full max-w-4xl flex-1 flex-col py-14 sm:py-20",
            turns.length === 0 ? "justify-center" : "justify-start",
          )}
        >
          {turns.length === 0 ? (
            <Hero brandName={brandName} onSuggestion={setPrompt} />
          ) : (
            <>
              {contextSummary ? (
                <ContextSummary
                  constraints={contextSummary}
                  disabled={isLoading}
                  onRemove={removeConstraint}
                />
              ) : null}
              <ResultArea
                isLoading={isLoading}
                onViewProduct={setSelectedProduct}
                onAddProduct={addProduct}
                addingProductIds={addingProductIds}
                cartFeedback={cartFeedback}
                turns={turns}
              />
            </>
          )}
        </div>
      </div>

      {selectedProduct ? (
        <ProductDetails
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onAdd={() => addProduct(selectedProduct)}
          isAdding={addingProductIds.has(selectedProduct.id)}
          cartFeedback={cartFeedback[selectedProduct.id]}
        />
      ) : null}

      <Composer
        brandName={brandName}
        prompt={prompt}
        setPrompt={setPrompt}
        isLoading={isLoading}
        onSubmit={submitPrompt}
      />
    </main>
  );
}
