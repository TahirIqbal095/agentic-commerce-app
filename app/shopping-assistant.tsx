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
import type {
  CartItemRemovalUndo,
  CartQuantityChange,
  CartView,
} from "@/modules/cart/cart";
import type { CartControlCommand } from "@/modules/cart/cart-control-command";

type AgentApiResponse = { data: AgentResult } | { error: { message: string } };
type ConversationApiResponse =
  | { data: CurrentConversation | null }
  | { error: { message: string } };
function latestInspectedCart(turns: ConversationTurn[]): CartView | null {
  const cart = [...turns]
    .reverse()
    .find((turn) => turn.result?.cart && "items" in turn.result.cart)
    ?.result?.cart;
  return cart && "items" in cart ? cart : null;
}

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
  const [pendingCartCommand, setPendingCartCommand] = useState<{
    productId?: string;
  } | null>(null);
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
    if (!conversationId || pendingCartCommand) return;
    const currentCart = latestInspectedCart(turns);
    const item = currentCart && "items" in currentCart
      ? currentCart.items.find((candidate) => candidate.productId === productId)
      : undefined;
    if (!item) return;

    await submitCartCommand({
      command: { type: "REMOVE_CART_ITEM", productId },
      customerMessage: `Remove ${item.productName} from my Cart`,
      fallbackMessage: "The Cart Item could not be removed.",
      productId,
    });
  }

  async function undoCartItemRemoval(undo: CartItemRemovalUndo) {
    if (!conversationId || pendingCartCommand) return;
    await submitCartCommand({
      command: { type: "UNDO_CART_ITEM_REMOVAL", removalId: undo.removalId },
      customerMessage: "Undo the recent Cart Item Removal",
      fallbackMessage: `${undo.productName} could not be restored.`,
    });
  }

  async function changeCartItemQuantity(
    productId: string,
    change: CartQuantityChange,
  ) {
    if (!conversationId || pendingCartCommand) return;
    const currentCart = latestInspectedCart(turns);
    const item = currentCart && "items" in currentCart
      ? currentCart.items.find((candidate) => candidate.productId === productId)
      : undefined;
    if (!item) return;

    const customerMessage = change.mode === "RELATIVE"
      ? `${change.quantity > 0 ? "Increase" : "Decrease"} ${item.productName} quantity by ${Math.abs(change.quantity)}`
      : `Set ${item.productName} quantity to ${change.quantity}`;
    await submitCartCommand({
      command: { type: "CHANGE_CART_ITEM_QUANTITY", productId, ...change },
      customerMessage,
      fallbackMessage: "The Cart Item quantity could not be changed.",
      productId,
    });
  }

  async function clearCart() {
    if (!conversationId || pendingCartCommand) return;
    if (!window.confirm("Clear every Cart Item?")) return;

    await submitCartCommand({
      command: { type: "CLEAR_CART" },
      customerMessage: "Clear my Cart",
      fallbackMessage: "The Cart could not be cleared.",
    });
  }

  async function submitCartCommand({
    command,
    customerMessage,
    fallbackMessage,
    productId,
  }: {
    command: CartControlCommand;
    customerMessage: string;
    fallbackMessage: string;
    productId?: string;
  }) {
    if (!conversationId || pendingCartCommand) return;
    const turnId = crypto.randomUUID();
    setCartCommandError(null);
    setPendingCartCommand(productId ? { productId } : {});
    setTurns((currentTurns) => [
      ...currentTurns,
      { id: turnId, customerMessage, result: null, error: null },
    ]);
    try {
      const response = await fetch("/api/agent/cart-command", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId, idempotencyKey: turnId, command }),
      });
      const payload = (await response.json()) as AgentApiResponse;
      if (!response.ok || !("data" in payload)) {
        throw new Error("error" in payload ? payload.error.message : fallbackMessage);
      }
      setTurns((currentTurns) =>
        currentTurns.map((turn) =>
          turn.id === turnId ? { ...turn, result: payload.data } : turn,
        ),
      );
      if (payload.data.cart) setCartQuantity(payload.data.cart.totalQuantity);
    } catch (requestError) {
      const message = requestError instanceof Error
        ? requestError.message
        : fallbackMessage;
      const restoredConversation = await loadCurrentConversation();
      if (restoredConversation) {
        setConversationId(restoredConversation.conversationId);
        setContextSummary(restoredConversation.contextSummary);
        const restoredCart = latestInspectedCart(restoredConversation.transcript);
        if (restoredCart) setCartQuantity(restoredCart.totalQuantity);
        const persistedTurn = restoredConversation.transcript.find(
          (turn) => turn.idempotencyKey === turnId,
        );
        const commandWasPersisted = Boolean(
          persistedTurn &&
          (persistedTurn.result !== null || persistedTurn.error !== null),
        );
        if (commandWasPersisted) {
          setTurns(restoredConversation.transcript);
        } else if (productId) {
          setTurns(restoredConversation.transcript);
          setCartCommandError({ productId, message });
        } else {
          setTurns([
            ...restoredConversation.transcript,
            { id: turnId, customerMessage, result: null, error: message },
          ]);
        }
      } else {
        if (productId) setCartCommandError({ productId, message });
        setTurns((currentTurns) =>
          currentTurns.map((turn) =>
            turn.id === turnId ? { ...turn, error: message } : turn,
          ),
        );
      }
    } finally {
      setPendingCartCommand(null);
    }
  }

  async function loadCurrentConversation(): Promise<CurrentConversation | null> {
    try {
      const response = await fetch("/api/agent/conversation");
      const payload = (await response.json()) as ConversationApiResponse;
      return response.ok && "data" in payload ? payload.data : null;
    } catch {
      return null;
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
                cartCommandPending={Boolean(pendingCartCommand)}
                cartCommandError={cartCommandError}
                onDiscoverProducts={() => void sendMessage("Show me Products")}
                onRemoveCartItem={(productId) => void removeCartItem(productId)}
                onUndoCartItemRemoval={(undo) =>
                  void undoCartItemRemoval(undo)}
                onChangeCartItemQuantity={(productId, change) =>
                  void changeCartItemQuantity(productId, change)}
                onClearCart={() => void clearCart()}
                onViewProduct={setSelectedProduct}
                pendingCartProductId={pendingCartCommand?.productId ?? null}
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
