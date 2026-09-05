import type { JsonObject } from "@/db/schema/types";

export type CatalogProduct = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  priceMinor: number;
  currency: string;
  inStock: boolean;
  attributes: JsonObject;
};

export type CatalogSearch = {
  query?: string;
  queries?: string[];
  productTypes?: string[];
  useCases?: string[];
  features?: string[];
  category?: string;
  minPriceMinor?: number;
  maxPriceMinor?: number;
  size?: string;
  inStockOnly?: boolean;
  attributes?: JsonObject;
  cursor?: string;
  limit: number;
};

/**
 * One category the Catalog offers, with how many active Products it holds.
 *
 * This is Catalog metadata, not a Recommendation Set: it exists before any
 * Conversation Turn has happened and carries no price or stock.
 */
export type CatalogCategory = {
  category: string;
  productCount: number;
};

export type CatalogSearchResult = {
  products: CatalogProduct[];
  nextCursor?: string;
};

export type CatalogError = {
  code: "PRODUCT_NOT_FOUND";
  message: string;
  details: Record<string, never>;
};

export type ProductDetailResult =
  | { ok: true; value: CatalogProduct }
  | { ok: false; error: CatalogError };
