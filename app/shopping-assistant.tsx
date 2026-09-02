"use client";

import { useEffect, useState, type FormEvent } from "react";

import { Composer } from "./_components/shopping-assistant/composer";
import type { CartLoadState } from "./_components/shopping-assistant/cart-drawer";
import type { CartItemCommand } from "./_components/shopping-assistant/cart-panel";
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
  const [cart, setCart] = useState<CartView | null>(null);
  const [cartState, setCartState] = useState<CartLoadState>(
    resumeConversation ? "loading" : "error",
  );
  const [addingProductIds, setAddingProductIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [cartFeedback, setCartFeedback] = useState<
    Record<string, CartFeedback>
  >({});
  const [pendingCartCommands, setPendingCartCommands] = useState<Set<string>>(
    () => new Set(),
  );
  const [cartItemFeedback, setCartItemFeedback] = useState<
    Record<string, string>
  >({});

  function replaceCartFromAuthority(nextCart: CartView) {
    setCart((current) =>
      current && current.version > nextCart.version ? current : nextCart,
    );
    setCartState("ready");
  }

  async function reloadCartFromAuthority() {
    try {
      const response = await fetch("/api/cart");
      if (!response.ok) return false;
      const payload = (await response.json()) as { data: CartView };
      replaceCartFromAuthority(payload.data);
      return true;
    } catch {
      return false;
    }
  }

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
        if (!response.ok) throw new Error("Cart unavailable");
        const payload = (await response.json()) as {
          data: CartView;
        };
        return payload.data;
      })
      .then((cart) => {
        if (!active) return;
        replaceCartFromAuthority(cart);
      })
      .catch(() => {
        if (active) setCartState("error");
      });
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
      if (payload.data.cart && "items" in payload.data.cart) {
        replaceCartFromAuthority(payload.data.cart);
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
    let cartWasReconciled = false;
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
          expectedVersion: cart?.version ?? 0,
        }),
      });
      const payload = (await response.json()) as CartApiResponse;
      if (!response.ok || !("data" in payload)) {
        if ("error" in payload && payload.error.details?.cart) {
          replaceCartFromAuthority(payload.error.details.cart);
          cartWasReconciled = true;
        }
        throw new Error(
          "error" in payload
            ? payload.error.message
            : `${product.name} could not be added.`,
        );
      }

      replaceCartFromAuthority(payload.data);
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
      if (!cartWasReconciled) {
        const reloaded = await reloadCartFromAuthority();
        if (!reloaded && !cart) setCartState("error");
      }
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

  async function changeCartItem(productId: string, command: CartItemCommand) {
    const pendingKey = `${productId}:${command}`;
    if (pendingCartCommands.has(pendingKey)) return;
    setPendingCartCommands((current) => new Set(current).add(pendingKey));
    setCartItemFeedback((current) => {
      const next = { ...current };
      delete next[productId];
      return next;
    });
    let cartWasReconciled = false;

    try {
      const response = await fetch("/api/cart", {
        method: command === "remove" ? "DELETE" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type:
            command === "increment"
              ? "INCREMENT_ITEM"
              : command === "decrement"
                ? "DECREMENT_ITEM"
                : "REMOVE_ITEM",
          productId,
          mutationKey: crypto.randomUUID(),
          expectedVersion: cart?.version ?? 0,
        }),
      });
      const payload = (await response.json()) as CartApiResponse;
      if (!response.ok || !("data" in payload)) {
        if ("error" in payload && payload.error.details?.cart) {
          replaceCartFromAuthority(payload.error.details.cart);
          cartWasReconciled = true;
        }
        throw new Error(
          "error" in payload
            ? payload.error.message
            : "The Cart Item could not be changed.",
        );
      }
      replaceCartFromAuthority(payload.data);
    } catch (requestError) {
      if (!cartWasReconciled) {
        await reloadCartFromAuthority();
      }
      setCartItemFeedback((current) => ({
        ...current,
        [productId]:
          requestError instanceof Error
            ? requestError.message
            : "The Cart Item could not be changed.",
      }));
    } finally {
      setPendingCartCommands((current) => {
        const next = new Set(current);
        next.delete(pendingKey);
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
          cart={cart}
          cartState={cartState}
          hasConversation={turns.length > 0}
          onNewConversation={startNewConversation}
          cartControls={{
            onCommand: changeCartItem,
            pendingCommands: pendingCartCommands,
            itemFeedback: cartItemFeedback,
          }}
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
