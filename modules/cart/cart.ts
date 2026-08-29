import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { cartItems, carts } from "@/db/schema/cart";
import { products } from "@/db/schema/catalog";
import type { CatalogProduct } from "@/modules/catalog/catalog";

export type CartSummary = {
  id: string;
  totalQuantity: number;
  subtotalMinor: number;
  currency: string;
};

export interface CartModule {
  addItem(product: CatalogProduct, quantity: number): Promise<CartSummary>;
}

export class CartError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CartError";
  }
}

export function createCartModule(userId: string): CartModule {
  return {
    async addItem(product, quantity) {
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
        throw new CartError("Cart item quantity must be between 1 and 10.");
      }

      return db.transaction(async (transaction) => {
        const [authoritativeProduct] = await transaction
          .select({
            id: products.id,
            priceMinor: products.priceMinor,
            currency: products.currency,
            stock: products.stock,
          })
          .from(products)
          .where(
            and(eq(products.id, product.id), eq(products.active, true)),
          )
          .limit(1);

        if (!authoritativeProduct) {
          throw new CartError("The requested product is not available.");
        }

        let [activeCart] = await transaction
          .select({ id: carts.id, currency: carts.currency })
          .from(carts)
          .where(
            and(eq(carts.userId, userId), eq(carts.status, "ACTIVE")),
          )
          .limit(1);

        if (!activeCart) {
          [activeCart] = await transaction
            .insert(carts)
            .values({
              userId,
              currency: authoritativeProduct.currency,
            })
            .returning({ id: carts.id, currency: carts.currency });
        }

        if (activeCart.currency !== authoritativeProduct.currency) {
          throw new CartError("The product currency does not match the cart.");
        }

        const [existingItem] = await transaction
          .select({ quantity: cartItems.quantity })
          .from(cartItems)
          .where(
            and(
              eq(cartItems.cartId, activeCart.id),
              eq(cartItems.productId, authoritativeProduct.id),
            ),
          )
          .limit(1);
        const nextQuantity = (existingItem?.quantity ?? 0) + quantity;

        if (nextQuantity > 10) {
          throw new CartError("A cart item cannot have more than 10 units.");
        }
        if (nextQuantity > authoritativeProduct.stock) {
          throw new CartError("The requested quantity is not in stock.");
        }

        await transaction
          .insert(cartItems)
          .values({
            cartId: activeCart.id,
            productId: authoritativeProduct.id,
            quantity: nextQuantity,
            unitPriceSnapshotMinor: authoritativeProduct.priceMinor,
          })
          .onConflictDoUpdate({
            target: [cartItems.cartId, cartItems.productId],
            set: {
              quantity: nextQuantity,
              unitPriceSnapshotMinor: authoritativeProduct.priceMinor,
              updatedAt: new Date(),
            },
          });

        await transaction
          .update(carts)
          .set({
            version: sql`${carts.version} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(carts.id, activeCart.id));

        const items = await transaction
          .select({
            quantity: cartItems.quantity,
            unitPriceMinor: cartItems.unitPriceSnapshotMinor,
          })
          .from(cartItems)
          .where(eq(cartItems.cartId, activeCart.id));

        return {
          id: activeCart.id,
          totalQuantity: items.reduce(
            (total, item) => total + item.quantity,
            0,
          ),
          subtotalMinor: items.reduce(
            (total, item) => total + item.quantity * item.unitPriceMinor,
            0,
          ),
          currency: activeCart.currency,
        };
      });
    },
  };
}
