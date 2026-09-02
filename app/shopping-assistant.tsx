"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

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
  | {
      error: { code?: string; message: string; details?: { cart?: CartView } };
    };

/**
 * Whether the authority decided this Cart command.
 *
 * A rejected command was read and refused, so its idempotency key is spent. A
 * server failure leaves the outcome unknown, so the key must survive for a
 * retry.
 */
function authorityAnsweredCommand(response: Response) {
  return response.status < 500;
}

/**
 * A Cart command the authority refused, carrying whether its answer already
 * replaced the displayed Cart. When it did, the Storefront must not read the
 * Cart again to recover.
 */
class CartCommandRejection extends Error {
  constructor(
    message: string,
    readonly cartWasReconciled: boolean,
  ) {
    super(message);
    this.name = "CartCommandRejection";
  }
}

function wasReconciled(requestError: unknown) {
  return (
    requestError instanceof CartCommandRejection &&
    requestError.cartWasReconciled
  );
}

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
  const mutationKeys = useRef(new Map<string, string>());

  /**
   * Returns the idempotency key for one logical Cart command.
   *
   * The key is minted once per command and kept until the authority answers, so
   * a Customer retrying a failed or timed-out command replays it instead of
   * applying it a second time.
   */
  function mutationKeyFor(commandKey: string) {
    const existing = mutationKeys.current.get(commandKey);
    if (existing) return existing;
    const issued = crypto.randomUUID();
    mutationKeys.current.set(commandKey, issued);
    return issued;
  }

  /**
   * Retires the idempotency key once the authority has answered the command,
   * whether it applied the command or rejected it. A later command is a new
   * Customer action and receives its own key.
   */
  function releaseMutationKey(commandKey: string) {
    mutationKeys.current.delete(commandKey);
  }

  /**
   * Adopts an authoritative Cart returned by a successful read or command.
   *
   * Responses can arrive out of order, so a Cart older than the one already
   * displayed is discarded rather than shown as current.
   */
  function replaceCartFromAuthority(nextCart: CartView) {
    setCart((current) =>
      current && current.version > nextCart.version ? current : nextCart,
    );
    setCartState("ready");
  }

  /**
   * Adopts the Cart carried by a rejected command.
   *
   * The authority read this Cart while refusing the command, so it replaces the
   * drawer and badge unconditionally — including when another tab emptied the
   * Cart and lowered its version.
   */
  function recoverCartFromConflict(latestCart: CartView) {
    setCart(latestCart);
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

  /**
   * Sends one explicit Cart command and adopts the authority's answer.
   *
   * The command carries its idempotency key and the displayed Cart version. A
   * refusal that carries the authoritative Cart replaces the displayed Cart —
   * unconditionally for a conflict, which is the latest Cart by definition, and
   * subject to the version guard for a rule the Customer can correct.
   *
   * @returns The authoritative Cart the command produced.
   * @throws {CartCommandRejection} When the authority refused the command.
   */
  async function sendCartCommand(
    method: "POST" | "PATCH" | "DELETE",
    commandKey: string,
    command: { type: string; productId: string },
    refusalMessage: string,
  ): Promise<CartView> {
    const response = await fetch("/api/cart", {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...command,
        mutationKey: mutationKeyFor(commandKey),
        expectedVersion: cart?.version ?? 0,
      }),
    });
    const payload = (await response.json()) as CartApiResponse;

    if (!response.ok || !("data" in payload)) {
      if (authorityAnsweredCommand(response)) releaseMutationKey(commandKey);
      const refusal = "error" in payload ? payload.error : null;
      const latestCart = refusal?.details?.cart;
      if (latestCart) {
        if (refusal?.code === "CART_CONFLICT") {
          recoverCartFromConflict(latestCart);
        } else {
          replaceCartFromAuthority(latestCart);
        }
      }
      throw new CartCommandRejection(
        refusal?.message ?? refusalMessage,
        latestCart !== undefined,
      );
    }

    releaseMutationKey(commandKey);
    replaceCartFromAuthority(payload.data);
    return payload.data;
  }

  async function addProduct(product: CatalogProduct) {
    if (addingProductIds.has(product.id)) return;
    const refusalMessage = `${product.name} could not be added.`;
    setAddingProductIds((current) => new Set(current).add(product.id));
    setCartFeedback((current) => {
      const next = { ...current };
      delete next[product.id];
      return next;
    });

    try {
      const appliedCart = await sendCartCommand(
        "POST",
        `${product.id}:add`,
        { type: "ADD_PRODUCT", productId: product.id },
        refusalMessage,
      );
      const item = appliedCart.items.find(
        (cartItem) => cartItem.productId === product.id,
      );
      setCartFeedback((current) => ({
        ...current,
        [product.id]: {
          kind: "success",
          message: `${product.name} quantity: ${item?.quantity ?? 0}. Cart subtotal: ${formatMoney(appliedCart.subtotalMinor, appliedCart.currency)}.`,
        },
      }));
    } catch (requestError) {
      if (!wasReconciled(requestError)) {
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
              : refusalMessage,
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
    const refusalMessage = "The Cart Item could not be changed.";
    setPendingCartCommands((current) => new Set(current).add(pendingKey));
    setCartItemFeedback((current) => {
      const next = { ...current };
      delete next[productId];
      return next;
    });

    try {
      await sendCartCommand(
        command === "remove" ? "DELETE" : "PATCH",
        pendingKey,
        {
          type:
            command === "increment"
              ? "INCREMENT_ITEM"
              : command === "decrement"
                ? "DECREMENT_ITEM"
                : "REMOVE_ITEM",
          productId,
        },
        refusalMessage,
      );
    } catch (requestError) {
      if (!wasReconciled(requestError)) {
        await reloadCartFromAuthority();
      }
      setCartItemFeedback((current) => ({
        ...current,
        [productId]:
          requestError instanceof Error ? requestError.message : refusalMessage,
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
