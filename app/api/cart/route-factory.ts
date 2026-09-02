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
          version: 0,
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
      const command = await parseCartCommand(
        request,
        ["ADD_PRODUCT"] as const,
        "type must be ADD_PRODUCT.",
      );
      if (command instanceof Response) return command;
      let cartModule: CartModule | null = null;
      try {
        cartModule = options.createCart(guestSession);
        const replay = await cartModule.replayMutation?.(
          command.productId,
          "ADD_PRODUCT",
          {
            mutationKey: command.mutationKey,
            expectedVersion: command.expectedVersion,
          },
        );
        if (replay) return dataResponse(replay);
        const product = await options.catalog.getProduct(command.productId);
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
        const cart = await cartModule.addItem(
          product.value,
          1,
          async () => {},
          {
            mutationKey: command.mutationKey,
            expectedVersion: command.expectedVersion,
          },
        );
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

export function createUpdateCartItemRoute(options: CartRouteOptions) {
  return createGuestSessionRoute(
    async (request, guestSession) => {
      const command = await parseCartCommand(
        request,
        ["INCREMENT_ITEM", "DECREMENT_ITEM"] as const,
        "type must be INCREMENT_ITEM or DECREMENT_ITEM.",
      );
      if (command instanceof Response) return command;

      const cartModule = options.createCart(guestSession);
      if (!cartModule.changeItemQuantity) {
        return unexpectedErrorResponse();
      }
      try {
        return dataResponse(
          await cartModule.changeItemQuantity(
            command.productId,
            command.type === "INCREMENT_ITEM" ? 1 : -1,
            async () => {},
            {
              mutationKey: command.mutationKey,
              expectedVersion: command.expectedVersion,
            },
          ),
        );
      } catch (error) {
        if (error instanceof CartError) {
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
        console.error("Cart Item update failed", error);
        return unexpectedErrorResponse();
      }
    },
    {
      store: options.store,
      ...(options.now ? { now: options.now } : {}),
    },
  );
}

export function createRemoveCartItemRoute(options: CartRouteOptions) {
  return createGuestSessionRoute(
    async (request, guestSession) => {
      const command = await parseCartCommand(
        request,
        ["REMOVE_ITEM"] as const,
        "type must be REMOVE_ITEM.",
      );
      if (command instanceof Response) return command;

      const cartModule = options.createCart(guestSession);
      if (!cartModule.removeItem) return unexpectedErrorResponse();
      try {
        return dataResponse(
          await cartModule.removeItem(command.productId, async () => {}, {
            mutationKey: command.mutationKey,
            expectedVersion: command.expectedVersion,
          }),
        );
      } catch (error) {
        if (error instanceof CartError) {
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
        console.error("Cart Item removal failed", error);
        return unexpectedErrorResponse();
      }
    },
    {
      store: options.store,
      ...(options.now ? { now: options.now } : {}),
    },
  );
}

async function parseCartCommand<const CommandType extends string>(
  request: Request,
  allowedTypes: readonly CommandType[],
  invalidTypeMessage: string,
): Promise<
  | {
      type: CommandType;
      productId: string;
      mutationKey: string;
      expectedVersion: number;
    }
  | Response
> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidCartCommand("Request body must be valid JSON.");
  }
  if (typeof body !== "object" || body === null) {
    return invalidCartCommand(invalidTypeMessage, "type");
  }
  const values = body as Record<string, unknown>;
  if (
    typeof values.type !== "string" ||
    !allowedTypes.includes(values.type as CommandType)
  ) {
    return invalidCartCommand(invalidTypeMessage, "type");
  }
  if (typeof values.productId !== "string" || !isUuid(values.productId)) {
    return invalidCartCommand("productId must be a UUID.", "productId");
  }
  if (typeof values.mutationKey !== "string" || !isUuid(values.mutationKey)) {
    return invalidCartCommand("mutationKey must be a UUID.", "mutationKey");
  }
  if (
    !Number.isSafeInteger(values.expectedVersion) ||
    Number(values.expectedVersion) < 0
  ) {
    return invalidCartCommand(
      "expectedVersion must be a nonnegative integer.",
      "expectedVersion",
    );
  }
  return {
    type: values.type as CommandType,
    productId: values.productId,
    mutationKey: values.mutationKey,
    expectedVersion: Number(values.expectedVersion),
  };
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
