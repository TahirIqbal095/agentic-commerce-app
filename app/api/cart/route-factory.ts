import {
  dataResponse,
  errorResponse,
  unexpectedErrorResponse,
} from "@/lib/http/responses";
import { isUuid } from "@/lib/validation";
import { CartError, type CartModule } from "@/modules/cart/cart";
import type { CatalogModule } from "@/modules/catalog/catalog";
import {
  createGuestSessionRoute,
  createGuestSessionBrowsingRoute,
  type GuestSession,
  type GuestSessionStore,
} from "@/modules/identity/guest-session";

type CartRouteOptions = {
  store: GuestSessionStore;
  createCart: (guestSession: GuestSession) => CartModule;
  now?: () => Date;
};

type AddToCartRouteOptions = CartRouteOptions & {
  catalog: CatalogModule;
  issueToken?: () => string;
};

export function createCartRoute(options: CartRouteOptions) {
  return createGuestSessionBrowsingRoute(
    async (_request, guestSession) => {
      if (!guestSession) {
        return dataResponse({
          id: null,
          items: [],
          totalQuantity: 0,
          subtotalMinor: 0,
          currency: "INR",
        });
      }
      try {
        return dataResponse(await options.createCart(guestSession).inspect());
      } catch (error) {
        console.error("Current Cart load failed", error);
        return unexpectedErrorResponse();
      }
    },
    {
      store: options.store,
      ...(options.now ? { now: options.now } : {}),
    },
  );
}

export function createAddToCartRoute(options: AddToCartRouteOptions) {
  return createGuestSessionRoute(
    async (request, guestSession) => {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return invalidCartCommand("Request body must be valid JSON.");
      }

      if (
        typeof body !== "object" ||
        body === null ||
        !("type" in body) ||
        body.type !== "ADD_PRODUCT"
      ) {
        return invalidCartCommand("type must be ADD_PRODUCT.", "type");
      }
      if (
        !("productId" in body) ||
        typeof body.productId !== "string" ||
        !isUuid(body.productId)
      ) {
        return invalidCartCommand("productId must be a UUID.", "productId");
      }
      if (
        !("mutationKey" in body) ||
        typeof body.mutationKey !== "string" ||
        !isUuid(body.mutationKey)
      ) {
        return invalidCartCommand("mutationKey must be a UUID.", "mutationKey");
      }

      let cartModule: CartModule | null = null;
      try {
        cartModule = options.createCart(guestSession);
        const product = await options.catalog.getProduct(body.productId);
        if (!product.ok) {
          const cart = await cartModule.inspect();
          return errorResponse(
            {
              code: "PRODUCT_UNAVAILABLE",
              message: "The Product is not available.",
              details: { cart },
            },
            409,
          );
        }
        const cart = await cartModule.addItem(product.value, 1, async () => {});
        return dataResponse(cart);
      } catch (error) {
        if (error instanceof CartError && cartModule) {
          const cart = await cartModule.inspect();
          return errorResponse(
            {
              code: "CART_RULE_REJECTED",
              message: error.message,
              details: { cart },
            },
            409,
          );
        }
        console.error("Add to Cart failed", error);
        return unexpectedErrorResponse();
      }
    },
    {
      store: options.store,
      ...(options.now ? { now: options.now } : {}),
      ...(options.issueToken ? { issueToken: options.issueToken } : {}),
    },
  );
}

function invalidCartCommand(message: string, field?: string): Response {
  return errorResponse(
    {
      code: "INVALID_CART_COMMAND",
      message,
      details: field ? { field } : {},
    },
    400,
  );
}
