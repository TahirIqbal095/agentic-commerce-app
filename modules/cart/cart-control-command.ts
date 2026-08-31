import type { CartQuantityChange } from "./cart";

export type CartControlCommand =
  | { type: "REMOVE_CART_ITEM"; productId: string }
  | ({ type: "CHANGE_CART_ITEM_QUANTITY"; productId: string } & CartQuantityChange)
  | { type: "CLEAR_CART" };
