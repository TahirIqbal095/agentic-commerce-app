"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { Composer } from "./_components/shopping-assistant/composer";
import type {
  CartLoadState,
  CartOutcome,
} from "./_components/shopping-assistant/cart-drawer";
import type { CartItemCommand } from "./_components/shopping-assistant/cart-panel";
import { ContextSummary } from "./_components/shopping-assistant/context-summary";
import {
  CheckoutTimelineRail,
  TIMELINE_RAIL_MEDIA_QUERY,
} from "./_components/shopping-assistant/checkout-timeline-rail";
import { Header } from "./_components/shopping-assistant/header";
import { OpeningState } from "./_components/shopping-assistant/opening-state";
import { ProductDetails } from "./_components/shopping-assistant/product-details";
import { useMediaQuery } from "./_components/shopping-assistant/media-query";
import { ResultArea } from "./_components/shopping-assistant/result-area";
import { useTranscriptScroll } from "./_components/shopping-assistant/transcript-scroll";
import type {
  AgentResult,
  CartFeedback,
  TranscriptEntry,
  CurrentConversation,
} from "./_components/shopping-assistant/types";
import type { CheckoutSession } from "./_components/shopping-assistant/checkout-entry-card";
import {
  isCustomerActionEntry,
  type CheckoutActionEntry,
  type CheckoutReadinessActionEntry,
} from "@/modules/agent/customer-action-entry";
import type { CheckoutLauncher } from "@/modules/checkout/checkout-launcher";
import type { CheckoutStatusView } from "@/modules/checkout/checkout-status";
import { launchRazorpayCheckout } from "@/modules/checkout/checkout-launcher";
import { formatMoney } from "@/lib/format-money";
import { cn } from "@/lib/utils";
import type { CartView } from "@/modules/cart/cart";
import type {
  CatalogCategory,
  CatalogProduct,
} from "@/modules/catalog/catalog";
import type {
  ProductConstraintKey,
  ShoppingIntent,
} from "@/modules/agent/intent";

type AgentApiResponse = { data: AgentResult } | { error: { message: string } };

type CheckoutReadinessApiResponse =
  | { data: CheckoutReadinessActionEntry }
  | { error: { message: string } };

type CheckoutApiResponse =
  | { data: CheckoutActionEntry }
  | { error: { message: string } };

type CartApiResponse =
  | { data: CartView }
  | {
      error: { code?: string; message: string; details?: { cart?: CartView } };
    };

/** A checkout no command has touched yet: idle, and with nothing to explain. */
const emptyCheckoutSession: CheckoutSession = {
  isApproving: false,
  isPaying: false,
  error: null,
  checkout: null,
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

/**
 * Whether this Transcript entry is the Conversation Turn awaiting `turnId`.
 *
 * A Customer Action Entry shares the Transcript but never carries a Turn
 * result, so it is left untouched when a Turn resolves.
 */
function isTurn(
  entry: TranscriptEntry,
  turnId: string,
): entry is Extract<TranscriptEntry, { customerMessage: string }> {
  return entry.id === turnId && !isCustomerActionEntry(entry);
}

/**
 * What one checkout's state means for the Customer's Cart.
 *
 * Only a terminal outcome means anything: a dismissal, a decline with attempts
 * remaining, and an Unknown Provider Outcome all leave the Cart alone, because
 * the Storefront does not yet know what happened and must not act as if it
 * did.
 *
 * @returns The outcome to land the Customer in, or `null` while there is none.
 */
function terminalCartOutcome(checkout: CheckoutStatusView): CartOutcome | null {
  if (checkout.status === "PAID") return "PAID";
  if (checkout.status === "PAYMENT_FAILED") return "UNPAYABLE";
  return null;
}

/**
 * The checkout the rail describes: the most recently approved one.
 *
 * A Conversation may hold several checkouts, and the one the Customer is
 * working on is the last that reached an Order. It keeps the rail for the rest
 * of the Conversation, including after it is paid, because a record of a
 * purchase is most useful just after the purchase.
 *
 * @returns That checkout's authoritative state, or `null` when the Customer
 *   has approved nothing and the Conversation should have the full width.
 */
function mostRecentApprovedCheckout(
  entries: TranscriptEntry[],
  sessions: Record<string, CheckoutSession>,
): { entryId: string; checkout: CheckoutStatusView } | null {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entryId = String(entries[index].id);
    const checkout = sessions[entryId]?.checkout;
    if (checkout) return { entryId, checkout };
  }
  return null;
}

/**
 * Whether this Transcript entry has the answer it was waiting for.
 *
 * A Customer Action Entry is answered the moment it exists, because the
 * deterministic result it carries arrived with it. A Conversation Turn is
 * answered when the Commerce Agent's result — or the reason there is none —
 * replaces its pending placeholder.
 */
function isAnswered(entry: TranscriptEntry) {
  return (
    isCustomerActionEntry(entry) || entry.result !== null || entry.error !== null
  );
}

/**
 * Reads the authority's answer, or raises the reason it refused.
 *
 * A refusal is a decision the Customer is entitled to read, so its own message
 * is kept rather than replaced with a generic failure.
 */
async function readData<Value>(
  response: Response,
  fallbackMessage: string,
): Promise<Value> {
  const payload = (await response.json()) as
    | { data: Value }
    | { error: { message: string } };
  if (!response.ok || !("data" in payload)) {
    throw new Error(
      "error" in payload ? payload.error.message : fallbackMessage,
    );
  }
  return payload.data;
}

function readCheckout(response: Response, fallbackMessage: string) {
  return readData<CheckoutStatusView>(response, fallbackMessage);
}

function wasReconciled(requestError: unknown) {
  return (
    requestError instanceof CartCommandRejection &&
    requestError.cartWasReconciled
  );
}

export function ShoppingAssistant({
  brandName,
  brandDescription,
  categories = [],
  initialConversation = null,
  resumeConversation = false,
  launchCheckout = launchRazorpayCheckout,
}: {
  brandName: string;
  /**
   * The Brand's own description of what it sells, read from the Brand record on
   * the server. It is the Storefront's headline, so the claim a Customer reads
   * is the Brand's rather than the Storefront's invention.
   */
  brandDescription: string;
  /**
   * What the Catalog offers, largest category first, read on the server. A
   * Catalog the Storefront could not read arrives as an empty list: the strip
   * it would have filled is missing, and everything else still works.
   */
  categories?: CatalogCategory[];
  initialConversation?: CurrentConversation | null;
  resumeConversation?: boolean;
  /**
   * How managed Razorpay Checkout is opened. Injected so a Storefront behavior
   * test proves the Customer's journey against a contract-faithful fake rather
   * than a hosted script and a credential.
   */
  launchCheckout?: CheckoutLauncher;
}) {
  const [prompt, setPrompt] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(
    initialConversation?.conversationId ?? null,
  );
  const [entries, setEntries] = useState<TranscriptEntry[]>(
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
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cartOutcome, setCartOutcome] = useState<CartOutcome | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [isPreparingCheckout, setIsPreparingCheckout] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutSessions, setCheckoutSessions] = useState<
    Record<string, CheckoutSession>
  >({});
  const mutationKeys = useRef(new Map<string, string>());
  const approvalKeys = useRef(new Map<string, string>());
  const settledCheckouts = useRef(new Set<string>());
  const transcriptScroll = useTranscriptScroll({
    entryCount: entries.length,
    answeredCount: entries.filter(isAnswered).length,
  });
  // Which arrangement the Checkout Timeline gets is resolved here rather than
  // by rendering both and hiding one, so the account appears exactly once in
  // the document however wide the viewport is.
  const railCheckout = useMediaQuery(TIMELINE_RAIL_MEDIA_QUERY)
    ? mostRecentApprovedCheckout(entries, checkoutSessions)
    : null;

  /**
   * Returns the idempotency key for one Checkout Proposal's Approval.
   *
   * The key is minted once per proposal and kept, so a double-clicked or
   * retried Approval submission resolves to the same Order rather than
   * preparing payment twice.
   */
  function approvalKeyFor(proposalId: string) {
    const existing = approvalKeys.current.get(proposalId);
    if (existing) return existing;
    const issued = crypto.randomUUID();
    approvalKeys.current.set(proposalId, issued);
    return issued;
  }

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
   * Adopts an authoritative Cart whatever version it carries.
   *
   * Two things produce a Cart older than the one on screen, and the version
   * guard would discard both. A rejected command's refusal carries the Cart the
   * authority read while refusing it, which another tab may have emptied. And
   * the read that follows a confirmed payment returns the fresh Cart that
   * replaced the one the Customer just paid for. Neither is a stale response;
   * both are the latest truth.
   */
  function adoptLatestCart(latestCart: CartView) {
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
        if (conversation.transcript.length > 0) transcriptScroll.markResumed();
        setEntries(conversation.transcript);
        setContextSummary(conversation.contextSummary);
        void resumeCheckouts(conversation.transcript, () => active);
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
    // The resume runs once for the conversation this mount loaded; re-running
    // it whenever a render redefines its helpers would re-read every checkout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeConversation]);

  async function submitPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = prompt.trim();
    if (!message || isLoading) return;
    setPrompt("");
    await sendMessage(message);
  }

  /**
   * Sends one message the opening state offered, as a typed message is sent.
   *
   * An example prompt and a Catalog category are entry points, not shortcuts to
   * the composer: tapping either starts a Conversation Turn rather than filling
   * the composer and leaving the Customer to find the send control.
   */
  function askFor(message: string) {
    if (isLoading) return;
    void sendMessage(message);
  }

  async function sendMessage(message: string) {
    const turnId = crypto.randomUUID();
    setEntries((currentEntries) => [
      ...currentEntries,
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

      setEntries((currentEntries) =>
        currentEntries.map((entry) =>
          isTurn(entry, turnId) ? { ...entry, result: payload.data } : entry,
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
      setEntries((currentEntries) =>
        currentEntries.map((entry) =>
          isTurn(entry, turnId) ? { ...entry, error: message } : entry,
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
    setEntries([]);
    setContextSummary(null);
    setSelectedProduct(null);
    // The rail follows the Conversation it belongs to, so a fresh Conversation
    // does not open beside the previous one's checkout.
    setCheckoutSessions({});
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
          adoptLatestCart(latestCart);
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

  /**
   * Reviews the authoritative Cart for Checkout Readiness.
   *
   * The review is deterministic: it never reaches the Commerce Agent, never
   * changes the Cart, and shows nothing until the authority answers. A
   * successful review appends the recorded Customer Action Entry to the
   * Transcript and closes the drawer so the Customer sees the card it produced.
   */
  async function reviewCheckoutReadiness() {
    if (isReviewing) return;
    setIsReviewing(true);
    setReviewError(null);

    try {
      const response = await fetch("/api/cart/checkout-readiness", {
        method: "POST",
      });
      const payload = (await response.json()) as CheckoutReadinessApiResponse;
      if (!response.ok || !("data" in payload)) {
        throw new Error(
          "error" in payload
            ? payload.error.message
            : "The Cart could not be reviewed.",
        );
      }
      setEntries((currentEntries) => [...currentEntries, payload.data]);
      replaceCartFromAuthority(payload.data.readiness.cart);
      showCart(false);
    } catch {
      setReviewError(
        "The Cart could not be reviewed for checkout. Try again shortly.",
      );
    } finally {
      setIsReviewing(false);
    }
  }

  /**
   * Recovers any checkout a reloaded Transcript is still holding open.
   *
   * A stored entry remembers the proposal a Customer was shown but nothing
   * about what happened afterwards, so the authority is asked. Without this a
   * refreshed page would offer a second Approval for an amount the Customer
   * has already approved.
   */
  async function resumeCheckouts(
    transcript: TranscriptEntry[],
    isActive: () => boolean,
  ) {
    const proposals = transcript.flatMap((entry) =>
      isCustomerActionEntry(entry) &&
      entry.action === "CHECKOUT" &&
      entry.preparation.status === "PREPARED"
        ? [{ entryId: entry.id, proposalId: entry.preparation.proposal.id }]
        : [],
    );

    for (const { entryId, proposalId } of proposals) {
      try {
        const response = await fetch(`/api/checkout/${proposalId}`);
        if (!response.ok || !isActive()) continue;
        // A checkout recovered from a reload is history, not news: the
        // Customer was already shown whatever it settled as, and the status
        // card in the Transcript is the durable record of it.
        updateCheckoutSession(
          entryId,
          { checkout: await readCheckout(response, "") },
          false,
        );
      } catch {
        // A checkout that cannot be read stays as the proposal the Customer
        // saw. The authority still refuses a second Approval for it.
      }
    }
  }

  /**
   * Opens or closes the Cart, ending any outcome message when it closes.
   *
   * The message is an event, not a state. Closing the Cart is how a Customer
   * dismisses it, and it does not come back when they open the Cart again.
   */
  function showCart(open: boolean) {
    setIsCartOpen(open);
    if (!open) setCartOutcome(null);
  }

  /**
   * Lands the Customer in their Cart the first time one checkout is observed
   * to have reached a terminal outcome.
   *
   * A Cart that empties itself is startling, so a paid checkout opens the Cart
   * and says why it is empty; an Order that can no longer be paid opens it and
   * says nothing was charged. It happens once per checkout rather than once
   * per observation, so asking Razorpay for the status of a settled Order does
   * not restage the announcement.
   *
   * @param announce - False while a reloaded Transcript is catching up on
   *   checkouts the Customer has already been told about.
   */
  function landInCart(
    entryId: string,
    checkout: CheckoutStatusView,
    announce: boolean,
  ) {
    if (settledCheckouts.current.has(entryId)) return;
    const outcome = terminalCartOutcome(checkout);
    if (!outcome) return;
    settledCheckouts.current.add(entryId);
    if (!announce) return;
    void readCartAfterCheckout();
    setCartOutcome(outcome);
    setIsCartOpen(true);
  }

  /**
   * Re-reads the Cart a settled checkout left behind.
   *
   * A read that fails leaves the Cart as it was; the message still says what
   * happened to it, and the checkout status card in the Transcript remains the
   * durable record either way.
   */
  async function readCartAfterCheckout() {
    try {
      const response = await fetch("/api/cart");
      if (!response.ok) return;
      const payload = (await response.json()) as { data: CartView };
      adoptLatestCart(payload.data);
    } catch {
      // Nothing to correct: the Cart on screen is the last one the authority
      // gave us, and the outcome message does not depend on this read.
    }
  }

  /**
   * Updates one checkout's client-side state without disturbing another's.
   */
  function updateCheckoutSession(
    entryId: string,
    change: Partial<CheckoutSession>,
    announceOutcome = true,
  ) {
    setCheckoutSessions((current) => ({
      ...current,
      [entryId]: { ...emptyCheckoutSession, ...current[entryId], ...change },
    }));
    if (change.checkout) landInCart(entryId, change.checkout, announceOutcome);
  }

  /**
   * Asks the authority to prepare a Checkout Proposal for the current Cart.
   *
   * The Storefront calculates nothing: the amounts, the policy result, the
   * expiry, and any blocker all come back from the deterministic checkout
   * authority, and the entry it recorded is appended to the Transcript exactly
   * as the Review for checkout entry is.
   */
  async function startCheckout() {
    if (isPreparingCheckout) return;
    setIsPreparingCheckout(true);
    setCheckoutError(null);

    try {
      const response = await fetch("/api/checkout/proposal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ commandKey: crypto.randomUUID() }),
      });
      const payload = (await response.json()) as CheckoutApiResponse;
      if (!response.ok || !("data" in payload)) {
        throw new Error(
          "error" in payload
            ? payload.error.message
            : "Checkout could not be prepared.",
        );
      }
      setEntries((currentEntries) => [...currentEntries, payload.data]);
      showCart(false);
    } catch {
      setCheckoutError(
        "Checkout could not be prepared right now. Try again shortly.",
      );
    } finally {
      setIsPreparingCheckout(false);
    }
  }

  /**
   * Submits the Customer's explicit Approval for one exact Checkout Proposal.
   *
   * The Approval carries the proposal it belongs to and the amount the
   * Customer was shown, so the authority can refuse an Approval that has
   * drifted from what was displayed rather than charging a different total.
   */
  async function approveCheckout(entry: CheckoutActionEntry) {
    if (entry.preparation.status !== "PREPARED") return;
    if (checkoutSessions[entry.id]?.isApproving) return;
    const { proposal } = entry.preparation;
    updateCheckoutSession(entry.id, { isApproving: true, error: null });

    try {
      const response = await fetch("/api/checkout/approval", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          proposalId: proposal.id,
          approvalKey: approvalKeyFor(proposal.id),
          approvedTotalMinor: proposal.checkoutTotalMinor,
          currency: proposal.currency,
        }),
      });
      const checkout = await readCheckout(
        response,
        "This approval could not be completed.",
      );
      updateCheckoutSession(entry.id, { isApproving: false, checkout });
      await openManagedCheckout(
        entry.id,
        await settleUnknownOutcome(entry.id, checkout),
      );
    } catch (requestError) {
      updateCheckoutSession(entry.id, {
        isApproving: false,
        error:
          requestError instanceof Error
            ? requestError.message
            : "This approval could not be completed.",
      });
    }
  }

  /**
   * Waits out an Unknown Provider Outcome with bounded background checking.
   *
   * The authority already spent one reconciliation read the moment the answer
   * was lost. This adds the bounded background work and then stops: once the
   * authority offers the Customer its own status control, automatic checking
   * has done all it may, and the remaining permitted read belongs to the
   * Customer. Nothing here retries payment creation.
   *
   * @returns The latest checkout state, resolved or still unknown.
   */
  async function settleUnknownOutcome(
    entryId: string,
    checkout: CheckoutStatusView,
  ): Promise<CheckoutStatusView> {
    let latest = checkout;
    while (
      latest.providerOperation.status === "OUTCOME_UNKNOWN" &&
      !latest.providerOperation.canCheckStatus
    ) {
      let reconciled: CheckoutStatusView;
      try {
        reconciled = await readCheckout(
          await fetch(`/api/checkout/${latest.orderId}/reconcile`, {
            method: "POST",
          }),
          "Razorpay's status could not be checked right now.",
        );
      } catch {
        return latest;
      }
      // A read that changed nothing means the authority has stopped; looping
      // again would spend the Customer's own remaining check for them.
      if (
        reconciled.providerOperation.reconciliationReadsUsed ===
        latest.providerOperation.reconciliationReadsUsed
      ) {
        updateCheckoutSession(entryId, { checkout: reconciled });
        return reconciled;
      }
      latest = reconciled;
      updateCheckoutSession(entryId, { checkout: latest });
    }
    return latest;
  }

  /**
   * Opens Razorpay's managed Test Checkout for one verified payment.
   *
   * It runs only once a Provider Order has been verified for the approved
   * amount, so a Customer can never be shown a payment they did not authorize.
   * Razorpay collects every instrument and OTP; the Storefront sends back only
   * the outcome, and the server decides what it means.
   */
  async function openManagedCheckout(
    entryId: string,
    checkout: CheckoutStatusView,
  ) {
    const { providerOrder } = checkout;
    if (!providerOrder || checkout.status === "PAID") return;
    updateCheckoutSession(entryId, { isPaying: true, error: null });

    try {
      const attemptResponse = await fetch(
        `/api/checkout/${checkout.orderId}/payment-attempt`,
        { method: "POST" },
      );
      const attempt = await readData<{
        attemptId: string;
        keyId: string;
        providerOrderId: string;
        amountMinor: number;
        currency: string;
        checkout: CheckoutStatusView;
      }>(attemptResponse, "Razorpay Test Checkout could not be opened.");
      updateCheckoutSession(entryId, { checkout: attempt.checkout });

      const result = await launchCheckout({
        orderId: checkout.orderId,
        keyId: attempt.keyId,
        providerOrderId: attempt.providerOrderId,
        amountMinor: attempt.amountMinor,
        currency: attempt.currency,
        brandName,
      });

      const callbackResponse = await fetch(
        `/api/checkout/${checkout.orderId}/callback`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ attemptId: attempt.attemptId, result }),
        },
      );
      updateCheckoutSession(entryId, {
        isPaying: false,
        checkout: await readCheckout(
          callbackResponse,
          "That payment result could not be recorded.",
        ),
      });
    } catch (requestError) {
      updateCheckoutSession(entryId, {
        isPaying: false,
        error:
          requestError instanceof Error
            ? requestError.message
            : "Razorpay Test Checkout could not be opened.",
      });
    }
  }

  /**
   * Reopens managed Checkout against the same verified payment.
   *
   * No fresh Approval is asked for: the Customer already authorized this exact
   * amount, and the authority enforces the launch limit, so retrying is a
   * continuation of one checkout rather than the start of another.
   */
  async function retryCheckout(entry: CheckoutActionEntry) {
    const session = checkoutSessions[entry.id];
    if (!session?.checkout || session.isPaying) return;
    await openManagedCheckout(entry.id, session.checkout);
  }

  /**
   * Asks for one more safe observation of what Razorpay actually did.
   *
   * It never retries payment creation: the authority spends a bounded
   * reconciliation read and returns whatever it learned.
   */
  async function checkCheckoutStatus(entry: CheckoutActionEntry) {
    const session = checkoutSessions[entry.id];
    if (!session?.checkout || session.isPaying) return;
    const orderId = session.checkout.orderId;
    updateCheckoutSession(entry.id, { isPaying: true, error: null });
    try {
      const response = await fetch(`/api/checkout/${orderId}/reconcile`, {
        method: "POST",
      });
      updateCheckoutSession(entry.id, {
        isPaying: false,
        checkout: await readCheckout(
          response,
          "Razorpay's status could not be checked right now.",
        ),
      });
    } catch (requestError) {
      updateCheckoutSession(entry.id, {
        isPaying: false,
        error:
          requestError instanceof Error
            ? requestError.message
            : "Razorpay's status could not be checked right now.",
      });
    }
  }

  /** Leaves an unsuccessful checkout behind and re-reads the current Cart. */
  async function returnToShopping() {
    await reloadCartFromAuthority();
    showCart(false);
  }

  /**
   * The deterministic Cart Item controls, shared by every surface that may
   * change the Cart. The Cart drawer and a blocked readiness card offer the
   * same commands, so correcting a blocker is the Customer action it already
   * was rather than a second, readiness-only path into the Cart.
   */
  const cartControls = {
    onCommand: changeCartItem,
    pendingCommands: pendingCartCommands,
    itemFeedback: cartItemFeedback,
  };

  // One composer, in one of two places. It is hoisted into the opening state
  // while there is nothing else on screen, and returns to its dock once the
  // Conversation Transcript needs the room — never both at once.
  const hasConversation = entries.length > 0;
  const composer = (
    <Composer
      brandName={brandName}
      placement={hasConversation ? "docked" : "hoisted"}
      prompt={prompt}
      setPrompt={setPrompt}
      isLoading={isLoading}
      onSubmit={submitPrompt}
    />
  );

  return (
    <main
      className={cn(
        "min-h-screen bg-background text-foreground",
        // The Storefront widens to make room for the rail rather than taking
        // the room out of the Conversation's reading measure. The header bar
        // reads the same measure, so the Brand mark and the Cart control stay
        // aligned with the Conversation they belong to at either width.
        railCheckout ? "[--storefront-column:86rem]" : "[--storefront-column:72rem]",
      )}
    >
      <Header
        brandName={brandName}
        cart={cart}
        cartState={cartState}
        hasConversation={hasConversation}
        onNewConversation={startNewConversation}
        cartControls={cartControls}
        checkoutReadiness={{
          onReview: reviewCheckoutReadiness,
          isReviewing,
          error: reviewError,
        }}
        checkout={{
          onCheckout: startCheckout,
          isPreparing: isPreparingCheckout,
          error: checkoutError,
        }}
        isCartOpen={isCartOpen}
        cartOutcome={cartOutcome}
        onCartOpenChange={showCart}
      />

      <div
        className={cn(
          "mx-auto flex min-h-[calc(100vh-var(--storefront-header-height))] w-full max-w-[var(--storefront-column)] flex-col px-4 sm:px-8",
          // Clearance for the dock, which only exists once the Conversation
          // does. Reserving it in the opening state would push the composer
          // off the centre it was hoisted into.
          hasConversation ? "pb-44 sm:pb-48" : "pb-14 sm:pb-20",
        )}
      >
        <div className="flex w-full flex-1 gap-8">
          {railCheckout ? (
            <CheckoutTimelineRail entries={railCheckout.checkout.timeline} />
          ) : null}
          <div
            className={cn(
              "mx-auto flex w-full max-w-4xl flex-1 flex-col py-14 sm:py-20",
              entries.length === 0 ? "justify-center" : "justify-start",
            )}
          >
            {entries.length === 0 ? (
              <OpeningState
                brandName={brandName}
                brandDescription={brandDescription}
                categories={categories}
                composer={composer}
                onPrompt={askFor}
              />
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
                  entries={entries}
                  currentCart={cart}
                  cartControls={cartControls}
                  checkoutSessions={checkoutSessions}
                  timelineRailEntryId={railCheckout?.entryId ?? null}
                  onApproveCheckout={approveCheckout}
                  onRetryCheckout={retryCheckout}
                  onCheckCheckoutStatus={checkCheckoutStatus}
                  onReturnToShopping={returnToShopping}
                />
              </>
            )}
          </div>
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

      {hasConversation ? composer : null}
    </main>
  );
}
