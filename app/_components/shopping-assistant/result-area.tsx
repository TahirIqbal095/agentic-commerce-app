import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";
import type { CatalogProduct } from "@/modules/catalog/catalog";
import { AgentMessage } from "./agent-message";
import { AgentProgress } from "./agent-progress";
import { CartPanel } from "./cart-panel";
import { CustomerMessage } from "./customer-message";
import { IntentSummary } from "./intent-summary";
import { RecommendationCarousel } from "./recommendation-carousel";
import type { ConversationTurn } from "./types";
import type {
  CartItemRemovalUndo,
  CartQuantityChange,
} from "@/modules/cart/cart";

export function ResultArea({
  cartCommandError,
  isLoading,
  onDiscoverProducts,
  onRemoveCartItem,
  onUndoCartItemRemoval,
  onChangeCartItemQuantity,
  onClearCart,
  onViewProduct,
  pendingCartProductId,
  cartCommandPending,
  turns,
}: {
  cartCommandError: { productId: string; message: string } | null;
  isLoading: boolean;
  onDiscoverProducts: () => void;
  onRemoveCartItem: (productId: string) => void;
  onUndoCartItemRemoval: (undo: CartItemRemovalUndo) => void;
  onChangeCartItemQuantity: (
    productId: string,
    change: CartQuantityChange,
  ) => void;
  onClearCart: () => void;
  onViewProduct: (product: CatalogProduct) => void;
  pendingCartProductId: string | null;
  cartCommandPending: boolean;
  turns: ConversationTurn[];
}) {
  const reduceMotion = useReducedMotion();
  const currentCartTurnId = [...turns]
    .reverse()
    .find((turn) => turn.result?.cart && "items" in turn.result.cart)?.id;
  const hasPendingCommand =
    isLoading || cartCommandPending || pendingCartProductId !== null;
  const pendingTurnId = hasPendingCommand ? turns.at(-1)?.id : undefined;

  return (
    <section
      aria-live="polite"
      aria-busy={hasPendingCommand}
      className="w-full space-y-7"
    >
      {turns.map((turn) => {
        const intent =
          turn.result?.intentBrief?.constraints ?? turn.result?.intent;
        const isPending =
          turn.id === pendingTurnId &&
          turn.result === null &&
          turn.error === null;
        const isNeedsInput = turn.result?.status === "NEEDS_INPUT";
        const cart = turn.result?.cart;
        const inspectedCart = cart && "items" in cart ? cart : null;

        return (
          <div key={turn.id} className="space-y-7">
            <CustomerMessage message={turn.customerMessage} />

            <AnimatePresence initial={false}>
              {isPending ? (
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

              {turn.error ? (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <AgentMessage>
                    <div className="rounded-2xl border border-red-200 bg-red-50/90 px-5 py-4 text-sm text-red-700">
                      {turn.error}
                    </div>
                  </AgentMessage>
                </motion.div>
              ) : null}

              {turn.result ? (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                >
                  <AgentMessage>
                    <div className="mb-8 flex flex-col gap-5">
                      <p
                        className={cn(
                          "max-w-3xl text-balance font-medium",
                          isNeedsInput
                            ? "text-base leading-7 sm:text-lg"
                            : "text-2xl leading-snug tracking-[-0.025em] sm:text-3xl",
                        )}
                      >
                        {turn.result.message}
                      </p>
                      {intent && !isNeedsInput ? (
                        <IntentSummary intent={intent} />
                      ) : null}
                    </div>

                    {turn.result.products.length > 0 ? (
                      <RecommendationCarousel
                        products={turn.result.products}
                        onViewProduct={onViewProduct}
                      />
                    ) : null}
                    {inspectedCart ? (
                      <CartPanel
                        cart={inspectedCart}
                        current={turn.id === currentCartTurnId}
                        itemError={
                          turn.id === currentCartTurnId && cartCommandError
                            ? cartCommandError
                            : turn.result?.status === "NEEDS_INPUT"
                            ? turn.result.cartItemError
                            : undefined
                        }
                        onDiscoverProducts={onDiscoverProducts}
                        onRemove={onRemoveCartItem}
                        onUndo={onUndoCartItemRemoval}
                        onChangeQuantity={onChangeCartItemQuantity}
                        onClear={onClearCart}
                        pendingProductId={pendingCartProductId}
                        cartPending={cartCommandPending}
                        undo={
                          "cartItemRemovalUndo" in turn.result
                            ? turn.result.cartItemRemovalUndo
                            : undefined
                        }
                      />
                    ) : null}
                  </AgentMessage>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        );
      })}
    </section>
  );
}
