import type { CatalogProduct } from "@/modules/catalog/catalog";

export type ShoppingIntent = {
  productTypes: string[];
  features: string[];
  category: string | null;
  minPriceMinor: number | null;
  maxPriceMinor: number | null;
};

export type AgentResult = {
  conversationId: string;
  message: string;
  intent?: ShoppingIntent;
  products: CatalogProduct[];
};
