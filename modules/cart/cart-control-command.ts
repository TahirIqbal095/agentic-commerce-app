import type { CartQuantityChange } from "./cart";

export type CartControlCommand =
  | { type: "REMOVE_CART_ITEM"; productId: string }
  | { type: "UNDO_CART_ITEM_REMOVAL"; removalId: string }
  | ({ type: "CHANGE_CART_ITEM_QUANTITY"; productId: string } & CartQuantityChange)
  | { type: "CLEAR_CART" };
