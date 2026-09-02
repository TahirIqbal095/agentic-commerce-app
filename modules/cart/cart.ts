import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import type { DbExecutor } from "@/db";
import { cartItems, cartMutations, carts } from "@/db/schema/cart";
import { products } from "@/db/schema/catalog";
import type { CatalogProduct } from "@/modules/catalog/catalog";

export type CartSummary = {
  id: string;
  version: number;
  totalQuantity: number;
  subtotalMinor: number;
  currency: string;
};

export type CartView = Omit<CartSummary, "id"> & {
  id: string | null;
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    cartPriceMinor: number;
    subtotalMinor: number;
  }>;
};

/**
 * A Cart read together with each Cart Item's current authoritative
 * availability.
 *
 * Checkout Readiness needs the Product state behind a Cart Item, not only the
 * commercial values a Customer sees, so it re-reads availability and stock in
 * the same read as the Cart itself. The availability is deliberately absent
 * from `CartView`, so it can never reach a persisted readiness card, a Cart
 * Summary, or the Commerce Agent.
 */
export type CartWithProductAvailability = Omit<CartView, "items"> & {
  items: Array<
    CartView["items"][number] & {
      isAvailable: boolean;
      stock: number;
    }
  >;
};

/**
 * The authoritative whole-unit ceiling for one Cart Item.
 *
 * Cart commands refuse to exceed it and Checkout Readiness reports a Cart Item
 * that already does, so both speak about the same limit.
 */
export const CART_ITEM_QUANTITY_LIMIT = 10;

/**
 * The only Currency the Storefront supports, named by ADR-0008.
 *
 * Persisted data outside it is rejected rather than converted, so Cart commands
 * and Checkout Readiness both refuse a Cart priced in anything else.
 */
export const STOREFRONT_CURRENCY = "INR";

export type CartAddition = {
  product: CatalogProduct;
  quantity: number;
};

export type CartMutation = {
  mutationKey: string;
  expectedVersion: number;
};

export type CartCommandType =
  | "ADD_PRODUCT"
  | "INCREMENT_ITEM"
  | "DECREMENT_ITEM"
  | "REMOVE_ITEM";

export interface CartModule {
  addItem(
    product: CatalogProduct,
    quantity: number,
    complete: (cart: CartView, transaction: DbExecutor) => Promise<void>,
    mutation?: CartMutation,
  ): Promise<CartView>;
  addItems?(
    additions: CartAddition[],
    complete: (cart: CartView, transaction: DbExecutor) => Promise<void>,
    mutation?: CartMutation,
  ): Promise<CartView>;
  changeItemQuantity?(
    productId: string,
    change: -1 | 1,
    complete: (cart: CartView, transaction: DbExecutor) => Promise<void>,
    mutation: CartMutation,
  ): Promise<CartView>;
  removeItem?(
    productId: string,
    complete: (cart: CartView, transaction: DbExecutor) => Promise<void>,
    mutation: CartMutation,
  ): Promise<CartView>;
  replayMutation?(
    productId: string,
    commandType: CartCommandType,
    mutation: CartMutation,
  ): Promise<CartView | null>;
  inspect(): Promise<CartView>;
  /**
   * Reads the Cart together with each Cart Item's current availability, for
   * the Checkout Readiness review that must judge stale Catalog state.
   */
  inspectForReview(): Promise<CartWithProductAvailability>;
}

export type CartErrorCode = "CART_RULE_REJECTED" | "CART_CONFLICT";

/**
 * A Cart rule the Customer can correct without losing their command, such as a
 * stock limit or the ten-unit Cart Item limit.
 */
export class CartError extends Error {
  readonly code: CartErrorCode = "CART_RULE_REJECTED";

  constructor(message: string) {
    super(message);
    this.name = "CartError";
  }
}

/**
 * A Cart command the authoritative Cart cannot reconcile, because another tab
 * already changed the Cart, the mutation key belongs to another command, or the
 * bounded conflict retries were exhausted. Its result is the latest
 * authoritative Cart rather than a correctable rule.
 */
export class CartConflictError extends CartError {
  override readonly code = "CART_CONFLICT";

  constructor(message: string) {
    super(message);
    this.name = "CartConflictError";
  }
}

/**
 * Bounded attempts for one Cart command that loses a database race.
 *
 * Cart commands serialize on a per-Guest-Session advisory lock, so a lost race
 * is rare. When one happens, retrying the whole command keeps every distinct
 * valid Customer action rather than discarding it.
 */
const CART_CONFLICT_RETRY_ATTEMPTS = 3;

const TRANSIENT_CONFLICT_CODES = new Set([
  "40001", // serialization_failure
  "40P01", // deadlock_detected
  // unique_violation on the one-active-Cart or mutation-key index. Retrying
  // re-enters the replay check first, so a duplicated mutation key resolves to
  // its original result rather than a second application.
  "23505",
]);

/**
 * Whether the database lost this Cart command to a race it can win on a retry.
 *
 * The driver wraps a failed query and carries the Postgres error as its cause,
 * so the code is read from the cause chain rather than the thrown value. A Cart
 * rule rejection anywhere in that chain is a decision, never a race.
 */
function isTransientCartConflict(error: unknown): boolean {
  for (let cause = error; cause != null; cause = (cause as { cause?: unknown }).cause) {
    if (cause instanceof CartError) return false;
    const code = (cause as { code?: unknown }).code;
    if (typeof code === "string" && TRANSIENT_CONFLICT_CODES.has(code)) {
      return true;
    }
  }
  return false;
}

/**
 * Runs one Cart command, retrying it while the database reports a transient
 * conflict.
 *
 * Cart rule rejections and unrelated failures are answered immediately, because
 * repeating them cannot change their result. When the bounded attempts are
 * exhausted the command becomes a typed Cart conflict, so the Customer receives
 * the latest authoritative Cart instead of an unexplained failure.
 *
 * @param runCommand - The Cart command to apply, retried as a whole.
 * @returns The applied command's authoritative result.
 * @throws {CartConflictError} When every bounded attempt lost its race.
 */
export async function withBoundedCartConflictRetry<Result>(
  runCommand: () => Promise<Result>,
): Promise<Result> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await runCommand();
    } catch (error) {
      if (!isTransientCartConflict(error)) throw error;
      if (attempt >= CART_CONFLICT_RETRY_ATTEMPTS) {
        throw new CartConflictError(
          "The Cart changed too many times to apply this command. Reload the Cart and try again.",
        );
      }
    }
  }
}

export function createCartModule(
  guestSessionId: string,
  defaultCurrency: string = STOREFRONT_CURRENCY,
): CartModule {
  if (defaultCurrency !== STOREFRONT_CURRENCY) {
    throw new CartError(`Cart currency must be ${STOREFRONT_CURRENCY}.`);
  }

  const addItems: NonNullable<CartModule["addItems"]> = async (
    additions,
    complete,
    mutation,
  ) => {
    if (additions.length === 0) {
      throw new CartError("At least one Cart Item is required.");
    }
    const productIds = new Set<string>();
    for (const { product, quantity } of additions) {
      if (productIds.has(product.id)) {
        throw new CartError(`${product.name} was selected more than once.`);
      }
      productIds.add(product.id);
      if (
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > CART_ITEM_QUANTITY_LIMIT
      ) {
        throw new CartError(
          `${product.name} quantity must be between 1 and ${CART_ITEM_QUANTITY_LIMIT}.`,
        );
      }
    }

    return withBoundedCartConflictRetry(() =>
      db.transaction(async (transaction) => {
        await transaction.execute(
          sql`select pg_advisory_xact_lock(hashtext(${guestSessionId}))`,
        );
        if (mutation) {
          const replay = await findMutationReplay(
            transaction,
            mutation,
            "ADD_PRODUCT",
            additions[0].product.id,
          );
          if (replay) return replay;
        }
        const productRows = await transaction
          .select({
            id: products.id,
            name: products.name,
            priceMinor: products.priceMinor,
            currency: products.currency,
            stock: products.stock,
            active: products.active,
          })
          .from(products)
          .where(inArray(products.id, [...productIds]));
        const authoritativeById = new Map(
          productRows.map((product) => [product.id, product]),
        );
        const authoritativeAdditions = additions.map(
          ({ product, quantity }) => {
            const authoritativeProduct = authoritativeById.get(product.id);
            if (!authoritativeProduct?.active) {
              throw new CartError(`${product.name} is not available.`);
            }
            return { product: authoritativeProduct, quantity };
          },
        );

        let [activeCart] = await transaction
          .select({
            id: carts.id,
            currency: carts.currency,
            version: carts.version,
          })
          .from(carts)
          .where(
            and(
              eq(carts.guestSessionId, guestSessionId),
              eq(carts.status, "ACTIVE"),
            ),
          )
          .limit(1);
        const cartCurrency =
          activeCart?.currency ?? authoritativeAdditions[0].product.currency;
        for (const { product } of authoritativeAdditions) {
          if (product.currency !== cartCurrency) {
            throw new CartError(
              `${product.name} uses ${product.currency}, but the Cart uses ${cartCurrency}.`,
            );
          }
        }

        if (mutation) {
          assertMutationVersionIsNotAhead(
            activeCart?.version ?? 0,
            mutation.expectedVersion,
          );
        }
        if (!activeCart) {
          [activeCart] = await transaction
            .insert(carts)
            .values({ guestSessionId, currency: cartCurrency })
            .returning({
              id: carts.id,
              currency: carts.currency,
              version: carts.version,
            });
        }
        const existingRows = await transaction
          .select({
            productId: cartItems.productId,
            quantity: cartItems.quantity,
            cartPriceMinor: cartItems.unitPriceSnapshotMinor,
          })
          .from(cartItems)
          .where(
            and(
              eq(cartItems.cartId, activeCart.id),
              inArray(cartItems.productId, [...productIds]),
            ),
          );
        const existingByProductId = new Map(
          existingRows.map((item) => [item.productId, item]),
        );
        const validatedAdditions = authoritativeAdditions.map(
          ({ product, quantity }) => {
            const existing = existingByProductId.get(product.id);
            const nextQuantity = (existing?.quantity ?? 0) + quantity;
            if (nextQuantity > CART_ITEM_QUANTITY_LIMIT) {
              throw new CartError(
                `${product.name} cannot have more than ${CART_ITEM_QUANTITY_LIMIT} units in the Cart.`,
              );
            }
            if (nextQuantity > product.stock) {
              throw new CartError(
                `${product.name} only has ${product.stock} ${product.stock === 1 ? "unit" : "units"} in stock.`,
              );
            }
            return { product, existing, nextQuantity };
          },
        );

        for (const { product, nextQuantity } of validatedAdditions) {
          await transaction
            .insert(cartItems)
            .values({
              cartId: activeCart.id,
              productId: product.id,
              quantity: nextQuantity,
              unitPriceSnapshotMinor: product.priceMinor,
            })
            .onConflictDoUpdate({
              target: [cartItems.cartId, cartItems.productId],
              set: {
                quantity: nextQuantity,
                updatedAt: new Date(),
              },
            });
        }

        const [updatedCart] = await transaction
          .update(carts)
          .set({ version: sql`${carts.version} + 1`, updatedAt: new Date() })
          .where(eq(carts.id, activeCart.id))
          .returning({ version: carts.version });

        const cart = await readCart(transaction, {
          ...activeCart,
          version: updatedCart.version,
        });
        if (mutation) {
          await recordMutation(
            transaction,
            mutation,
            "ADD_PRODUCT",
            additions[0].product.id,
            cart,
          );
        }
        await complete(cart, transaction);
        return cart;
      }),
    );
  };

  const findMutationReplay = async (
    transaction: DbExecutor,
    mutation: CartMutation,
    commandType: CartCommandType,
    productId: string,
  ) => {
    const [stored] = await transaction
      .select({
        commandType: cartMutations.commandType,
        productId: cartMutations.productId,
        result: cartMutations.result,
      })
      .from(cartMutations)
      .where(
        and(
          eq(cartMutations.guestSessionId, guestSessionId),
          eq(cartMutations.mutationKey, mutation.mutationKey),
        ),
      )
      .limit(1);
    if (!stored) return null;
    if (stored.commandType !== commandType || stored.productId !== productId) {
      throw new CartConflictError(
        "The mutation key was already used for another Cart command.",
      );
    }
    return structuredClone(stored.result) as CartView;
  };

  const recordMutation = async (
    transaction: DbExecutor,
    mutation: CartMutation,
    commandType: CartCommandType,
    productId: string,
    result: CartView,
  ) => {
    await transaction.insert(cartMutations).values({
      guestSessionId,
      mutationKey: mutation.mutationKey,
      commandType,
      productId,
      result,
    });
  };

  const findActiveCart = async (transaction: DbExecutor) => {
    const [activeCart] = await transaction
      .select({
        id: carts.id,
        currency: carts.currency,
        version: carts.version,
      })
      .from(carts)
      .where(
        and(
          eq(carts.guestSessionId, guestSessionId),
          eq(carts.status, "ACTIVE"),
        ),
      )
      .limit(1);
    if (!activeCart) {
      throw new CartConflictError("The Cart Item is no longer in the Cart.");
    }
    return activeCart;
  };

  const readActiveCart = async () =>
    (
      await db
        .select({
          id: carts.id,
          currency: carts.currency,
          version: carts.version,
        })
        .from(carts)
        .where(
          and(
            eq(carts.guestSessionId, guestSessionId),
            eq(carts.status, "ACTIVE"),
          ),
        )
        .limit(1)
    )[0];

  const emptyCart = (): CartWithProductAvailability => ({
    id: null,
    version: 0,
    items: [],
    totalQuantity: 0,
    subtotalMinor: 0,
    currency: defaultCurrency,
  });

  return {
    async inspect() {
      const activeCart = await readActiveCart();
      if (!activeCart) return emptyCart();
      return readCart(db, activeCart);
    },
    async inspectForReview() {
      const activeCart = await readActiveCart();
      if (!activeCart) return emptyCart();
      return readCartWithProductAvailability(db, activeCart);
    },
    async addItem(product, quantity, complete, mutation) {
      return addItems([{ product, quantity }], complete, mutation);
    },
    addItems,
    async replayMutation(productId, commandType, mutation) {
      return db.transaction(async (transaction) => {
        await transaction.execute(
          sql`select pg_advisory_xact_lock(hashtext(${guestSessionId}))`,
        );
        return findMutationReplay(
          transaction,
          mutation,
          commandType,
          productId,
        );
      });
    },
    async changeItemQuantity(productId, change, complete, mutation) {
      return withBoundedCartConflictRetry(() =>
        db.transaction(async (transaction) => {
          await transaction.execute(
            sql`select pg_advisory_xact_lock(hashtext(${guestSessionId}))`,
          );
          const commandType =
            change === 1 ? "INCREMENT_ITEM" : "DECREMENT_ITEM";
          const replay = await findMutationReplay(
            transaction,
            mutation,
            commandType,
            productId,
          );
          if (replay) return replay;
          const activeCart = await findActiveCart(transaction);
          assertMutationVersionIsNotAhead(
            activeCart.version,
            mutation.expectedVersion,
          );
          const [item] = await transaction
            .select({
              id: cartItems.id,
              productName: products.name,
              quantity: cartItems.quantity,
              stock: products.stock,
              active: products.active,
            })
            .from(cartItems)
            .innerJoin(products, eq(products.id, cartItems.productId))
            .where(
              and(
                eq(cartItems.cartId, activeCart.id),
                eq(cartItems.productId, productId),
              ),
            )
            .limit(1);
          if (!item) {
            throw new CartConflictError(
              "The Cart Item is no longer in the Cart.",
            );
          }

          const nextQuantity = item.quantity + change;
          if (nextQuantity < 1) {
            throw new CartError(
              `${item.productName} quantity cannot be lower than 1. Use Remove instead.`,
            );
          }
          if (change === 1) {
            if (!item.active) {
              throw new CartError(`${item.productName} is not available.`);
            }
            if (nextQuantity > CART_ITEM_QUANTITY_LIMIT) {
              throw new CartError(
                `${item.productName} cannot have more than ${CART_ITEM_QUANTITY_LIMIT} units in the Cart.`,
              );
            }
            if (nextQuantity > item.stock) {
              throw new CartError(
                `${item.productName} only has ${item.stock} ${item.stock === 1 ? "unit" : "units"} in stock.`,
              );
            }
          }

          await transaction
            .update(cartItems)
            .set({ quantity: nextQuantity, updatedAt: new Date() })
            .where(eq(cartItems.id, item.id));
          const [updatedCart] = await transaction
            .update(carts)
            .set({ version: sql`${carts.version} + 1`, updatedAt: new Date() })
            .where(eq(carts.id, activeCart.id))
            .returning({ version: carts.version });
          const cart = await readCart(transaction, {
            ...activeCart,
            version: updatedCart.version,
          });
          await recordMutation(
            transaction,
            mutation,
            commandType,
            productId,
            cart,
          );
          await complete(cart, transaction);
          return cart;
        }),
      );
    },
    async removeItem(productId, complete, mutation) {
      return withBoundedCartConflictRetry(() =>
        db.transaction(async (transaction) => {
          await transaction.execute(
            sql`select pg_advisory_xact_lock(hashtext(${guestSessionId}))`,
          );
          const replay = await findMutationReplay(
            transaction,
            mutation,
            "REMOVE_ITEM",
            productId,
          );
          if (replay) return replay;
          const activeCart = await findActiveCart(transaction);
          assertMutationVersionIsNotAhead(
            activeCart.version,
            mutation.expectedVersion,
          );
          const removed = await transaction
            .delete(cartItems)
            .where(
              and(
                eq(cartItems.cartId, activeCart.id),
                eq(cartItems.productId, productId),
              ),
            )
            .returning({ id: cartItems.id });
          if (removed.length === 0) {
            throw new CartConflictError(
              "The Cart Item is no longer in the Cart.",
            );
          }

          const [updatedCart] = await transaction
            .update(carts)
            .set({ version: sql`${carts.version} + 1`, updatedAt: new Date() })
            .where(eq(carts.id, activeCart.id))
            .returning({ version: carts.version });
          const cart = await readCart(transaction, {
            ...activeCart,
            version: updatedCart.version,
          });
          await recordMutation(
            transaction,
            mutation,
            "REMOVE_ITEM",
            productId,
            cart,
          );
          await complete(cart, transaction);
          return cart;
        }),
      );
    },
  };
}

/**
 * Reads one Cart with the current availability behind each Cart Item.
 *
 * Availability is read in the same statement as the Cart, so a readiness
 * decision can never pair a Cart Item with Product state read at another
 * moment.
 */
async function readCartWithProductAvailability(
  executor: DbExecutor,
  activeCart: { id: string; currency: string; version: number },
): Promise<CartWithProductAvailability> {
  const items = await executor
    .select({
      productId: cartItems.productId,
      productName: products.name,
      quantity: cartItems.quantity,
      cartPriceMinor: cartItems.unitPriceSnapshotMinor,
      isAvailable: products.active,
      stock: products.stock,
    })
    .from(cartItems)
    .innerJoin(products, eq(products.id, cartItems.productId))
    .where(eq(cartItems.cartId, activeCart.id))
    .orderBy(asc(cartItems.createdAt), asc(cartItems.id));
  const viewedItems = items.map((item) => ({
    ...item,
    subtotalMinor: item.quantity * item.cartPriceMinor,
  }));

  return {
    id: activeCart.id,
    version: activeCart.version,
    items: viewedItems,
    totalQuantity: viewedItems.reduce(
      (total, item) => total + item.quantity,
      0,
    ),
    subtotalMinor: viewedItems.reduce(
      (total, item) => total + item.subtotalMinor,
      0,
    ),
    currency: activeCart.currency,
  };
}

/**
 * Reads one Cart as the Customer-visible Cart Summary.
 *
 * Product availability is dropped here, so no Cart response, persisted card, or
 * Commerce Agent payload can carry inventory state it has no reason to know.
 */
async function readCart(
  executor: DbExecutor,
  activeCart: { id: string; currency: string; version: number },
): Promise<CartView> {
  const { items, ...cart } = await readCartWithProductAvailability(executor, activeCart);
  return { ...cart, items: items.map(toCartViewItem) };
}

/**
 * Narrows one reviewed Cart Item to the commercial values a Customer sees.
 *
 * Checkout Readiness judges availability but must not carry it into the Cart it
 * reports, so the Cart in a readiness result is built through this narrowing.
 *
 * @param item - One Cart Item read with its current Product availability.
 * @returns The same Cart Item without any inventory state.
 */
export function toCartViewItem({
  productId,
  productName,
  quantity,
  cartPriceMinor,
  subtotalMinor,
}: CartWithProductAvailability["items"][number]): CartView["items"][number] {
  return { productId, productName, quantity, cartPriceMinor, subtotalMinor };
}

function assertMutationVersionIsNotAhead(
  currentVersion: number,
  expectedVersion: number,
) {
  if (expectedVersion > currentVersion) {
    throw new CartConflictError(
      "The Cart version is newer than the authoritative Cart. Reload the Cart and try again.",
    );
  }
}
