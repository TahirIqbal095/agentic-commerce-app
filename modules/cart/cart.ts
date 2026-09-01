import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import type { DbExecutor } from "@/db";
import { cartItems, carts } from "@/db/schema/cart";
import { products } from "@/db/schema/catalog";
import type { CatalogProduct } from "@/modules/catalog/catalog";

export type CartSummary = {
  id: string;
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

export type CartAddition = {
  product: CatalogProduct;
  quantity: number;
};

export interface CartModule {
  addItem(
    product: CatalogProduct,
    quantity: number,
    complete: (cart: CartView, transaction: DbExecutor) => Promise<void>,
  ): Promise<CartView>;
  addItems?(
    additions: CartAddition[],
    complete: (cart: CartView, transaction: DbExecutor) => Promise<void>,
  ): Promise<CartView>;
  inspect(): Promise<CartView>;
}

export class CartError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CartError";
  }
}

export function createCartModule(
  userId: string,
  defaultCurrency = "INR",
): CartModule {
  if (defaultCurrency !== "INR") {
    throw new CartError("Cart currency must be INR.");
  }

  const addItems: NonNullable<CartModule["addItems"]> = async (
    additions,
    complete,
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
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
        throw new CartError(
          `${product.name} quantity must be between 1 and 10.`,
        );
      }
    }

    return db.transaction(async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtext(${userId}))`,
      );
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
      const authoritativeAdditions = additions.map(({ product, quantity }) => {
        const authoritativeProduct = authoritativeById.get(product.id);
        if (!authoritativeProduct?.active) {
          throw new CartError(`${product.name} is not available.`);
        }
        return { product: authoritativeProduct, quantity };
      });

      let [activeCart] = await transaction
        .select({ id: carts.id, currency: carts.currency })
        .from(carts)
        .where(and(eq(carts.userId, userId), eq(carts.status, "ACTIVE")))
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

      if (!activeCart) {
        [activeCart] = await transaction
          .insert(carts)
          .values({ userId, currency: cartCurrency })
          .returning({ id: carts.id, currency: carts.currency });
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
          if (nextQuantity > 10) {
            throw new CartError(
              `${product.name} cannot have more than 10 units in the Cart.`,
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

      await transaction
        .update(carts)
        .set({ version: sql`${carts.version} + 1`, updatedAt: new Date() })
        .where(eq(carts.id, activeCart.id));

      const cart = await readCart(transaction, activeCart);
      await complete(cart, transaction);
      return cart;
    });
  };

  return {
    async inspect() {
      const [activeCart] = await db
        .select({ id: carts.id, currency: carts.currency })
        .from(carts)
        .where(and(eq(carts.userId, userId), eq(carts.status, "ACTIVE")))
        .limit(1);

      if (!activeCart) {
        return {
          id: null,
          items: [],
          totalQuantity: 0,
          subtotalMinor: 0,
          currency: defaultCurrency,
        };
      }

      return readCart(db, activeCart);
    },
    async addItem(product, quantity, complete) {
      return addItems([{ product, quantity }], complete);
    },
    addItems,
  };
}

async function readCart(
  executor: DbExecutor,
  activeCart: { id: string; currency: string },
): Promise<CartView> {
  const items = await executor
    .select({
      productId: cartItems.productId,
      productName: products.name,
      quantity: cartItems.quantity,
      cartPriceMinor: cartItems.unitPriceSnapshotMinor,
    })
    .from(cartItems)
    .innerJoin(products, eq(products.id, cartItems.productId))
    .where(eq(cartItems.cartId, activeCart.id))
    .orderBy(asc(cartItems.createdAt), asc(cartItems.id));
  const viewedItems = items.map(
    ({ productId, productName, quantity, cartPriceMinor }) => ({
      productId,
      productName,
      quantity,
      cartPriceMinor,
      subtotalMinor: quantity * cartPriceMinor,
    }),
  );

  return {
    id: activeCart.id,
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
