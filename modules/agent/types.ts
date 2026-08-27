import { CatalogProduct } from "../catalog/types";

export type AgentMessage = {
  conversationId?: string;
  message: string;
};

export type ShoppingAttributes = Record<string, string | number | boolean>;

export type ShoppingIntent = {
  productTypes: string[];
  useCases: string[];
  features: string[];
  category: string | null;
  minPriceMinor: number | null;
  maxPriceMinor: number | null;
  size: string | null;
  inStockOnly: boolean;
  attributes: ShoppingAttributes;
};

export type AgentResponse = {
  conversationId: string;
  message: string;
  intent: ShoppingIntent;
  products: CatalogProduct[];
};
