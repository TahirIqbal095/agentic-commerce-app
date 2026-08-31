"use client";

import { useState, type FormEvent } from "react";

import { Composer } from "./_components/shopping-assistant/composer";
import { ContextSummary } from "./_components/shopping-assistant/context-summary";
import { Header } from "./_components/shopping-assistant/header";
import { Hero } from "./_components/shopping-assistant/hero";
import { ProductDetails } from "./_components/shopping-assistant/product-details";
import { ResultArea } from "./_components/shopping-assistant/result-area";
import type {
  AgentResult,
  ConversationTurn,
  CurrentConversation,
} from "./_components/shopping-assistant/types";
import { cn } from "@/lib/utils";
import type { CatalogProduct } from "@/modules/catalog/catalog";
import type {
  ProductConstraintKey,
  ShoppingIntent,
} from "@/modules/agent/intent";

type AgentApiResponse = { data: AgentResult } | { error: { message: string } };
type ConversationApiResponse =
  | { data: CurrentConversation | null }
  | { error: { message: string } };

export function ShoppingAssistant({
  brandName,
  initialConversation = null,
}: {
  brandName: string;
  initialConversation?: CurrentConversation | null;
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
  const [cartQuantity, setCartQuantity] = useState(() => {
    const latestCart = [...(initialConversation?.transcript ?? [])]
      .reverse()
      .find((turn) => turn.result?.cart)?.result?.cart;
    return latestCart?.totalQuantity ?? 0;
  });
  const [pendingCartProductId, setPendingCartProductId] = useState<string | null>(
    null,
  );
  const [cartCommandError, setCartCommandError] = useState<{
    productId: string;
    message: string;
  } | null>(null);

  async function submitPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = prompt.trim();
    if (!message || isLoading) return;
    setPrompt("");
    await sendMessage(message);
  }

  async function sendMessage(message: string) {
    const turnId = crypto.randomUUID();
    setCartCommandError(null);
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

  async function removeCartItem(productId: string) {
    if (!conversationId || pendingCartProductId) return;
    const currentCart = [...turns]
      .reverse()
      .find((turn) => turn.result?.cart && "items" in turn.result.cart)
      ?.result?.cart;
    const item = currentCart && "items" in currentCart
      ? currentCart.items.find((candidate) => candidate.productId === productId)
      : undefined;
    if (!item) return;

    const turnId = crypto.randomUUID();
    setCartCommandError(null);
    setPendingCartProductId(productId);
    setTurns((currentTurns) => [
      ...currentTurns,
      {
        id: turnId,
        customerMessage: `Remove ${item.productName} from my Cart`,
        result: null,
        error: null,
      },
    ]);
    try {
      const response = await fetch("/api/agent/cart-command", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId,
          idempotencyKey: turnId,
          command: { type: "REMOVE_CART_ITEM", productId },
        }),
      });
      const payload = (await response.json()) as AgentApiResponse;
      if (!response.ok || !("data" in payload)) {
        throw new Error(
          "error" in payload
            ? payload.error.message
            : "The Cart Item could not be removed.",
        );
      }
      setTurns((currentTurns) =>
        currentTurns.map((turn) =>
          turn.id === turnId ? { ...turn, result: payload.data } : turn,
        ),
      );
      if (payload.data.cart) {
        setCartQuantity(payload.data.cart.totalQuantity);
      }
    } catch (requestError) {
      const message = requestError instanceof Error
        ? requestError.message
        : "The Cart Item could not be removed.";
      let restoredConversation: CurrentConversation | null = null;
      try {
        const response = await fetch("/api/agent/conversation");
        const payload = (await response.json()) as ConversationApiResponse;
        if (response.ok && "data" in payload) {
          restoredConversation = payload.data;
        }
      } catch {
        // The last authoritative Cart Summary remains visible below.
      }

      if (restoredConversation) {
        setConversationId(restoredConversation.conversationId);
        setTurns(restoredConversation.transcript);
        setContextSummary(restoredConversation.contextSummary);
        const restoredCart = [...restoredConversation.transcript]
          .reverse()
          .find((turn) => turn.result?.cart && "items" in turn.result.cart)
          ?.result?.cart;
        if (restoredCart && "items" in restoredCart) {
          setCartQuantity(restoredCart.totalQuantity);
          if (restoredCart.items.some((candidate) => candidate.productId === productId)) {
            setCartCommandError({ productId, message });
          }
        }
      } else {
        setCartCommandError({ productId, message });
        setTurns((currentTurns) =>
          currentTurns.map((turn) =>
            turn.id === turnId ? { ...turn, error: message } : turn,
          ),
        );
      }
    } finally {
      setPendingCartProductId(null);
    }
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
                cartCommandError={cartCommandError}
                onDiscoverProducts={() => void sendMessage("Show me Products")}
                onRemoveCartItem={(productId) => void removeCartItem(productId)}
                onViewProduct={setSelectedProduct}
                pendingCartProductId={pendingCartProductId}
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
