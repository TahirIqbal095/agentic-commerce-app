import {
  and,
  asc,
  eq,
  gt,
  gte,
  ilike,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema/catalog";
import type {
  CatalogModule,
  CatalogProduct,
  CatalogSearch,
  CatalogSearchResult,
  ProductDetailResult,
} from "./types";

const productSelection = {
  id: products.id,
  slug: products.slug,
  name: products.name,
  description: products.description,
  category: products.category,
  priceMinor: products.priceMinor,
  currency: products.currency,
  stock: products.stock,
  attributes: products.attributes,
};

type ProductRow = typeof products.$inferSelect;

function toCatalogProduct(
  row: Pick<ProductRow, keyof typeof productSelection>,
): CatalogProduct {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    category: row.category,
    priceMinor: row.priceMinor,
    currency: row.currency,
    inStock: row.stock > 0,
    attributes: row.attributes,
  };
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

export function createCatalogModule(merchantId: string): CatalogModule {
  return {
    async search(input: CatalogSearch): Promise<CatalogSearchResult> {
      const filters: SQL[] = [
        eq(products.merchantId, merchantId),
        eq(products.active, true),
      ];

      if (input.query !== undefined) {
        const pattern = `%${escapeLikePattern(input.query)}%`;
        const textMatch = or(
          ilike(products.name, pattern),
          ilike(products.description, pattern),
          ilike(products.slug, pattern),
        );
        if (textMatch) filters.push(textMatch);
      }
      if (input.category !== undefined) {
        filters.push(eq(products.category, input.category));
      }
      if (input.minPriceMinor !== undefined) {
        filters.push(gte(products.priceMinor, input.minPriceMinor));
      }
      if (input.maxPriceMinor !== undefined) {
        filters.push(lte(products.priceMinor, input.maxPriceMinor));
      }
      if (input.attributes !== undefined) {
        filters.push(
          sql`${products.attributes} @> ${JSON.stringify(input.attributes)}::jsonb`,
        );
      }
      if (input.cursor !== undefined) {
        filters.push(gt(products.id, input.cursor));
      }

      const rows = await db
        .select(productSelection)
        .from(products)
        .where(and(...filters))
        .orderBy(asc(products.id))
        .limit(input.limit + 1);

      const hasNextPage = rows.length > input.limit;
      const visibleRows = hasNextPage ? rows.slice(0, input.limit) : rows;

      return {
        products: visibleRows.map(toCatalogProduct),
        ...(hasNextPage
          ? { nextCursor: visibleRows[visibleRows.length - 1].id }
          : {}),
      };
    },

    async getProduct(productId: string): Promise<ProductDetailResult> {
      const [row] = await db
        .select(productSelection)
        .from(products)
        .where(
          and(
            eq(products.id, productId),
            eq(products.merchantId, merchantId),
            eq(products.active, true),
          ),
        )
        .limit(1);

      if (!row) {
        return {
          ok: false,
          error: {
            code: "PRODUCT_NOT_FOUND",
            message: "The requested product was not found.",
            details: {},
          },
        };
      }

      return { ok: true, value: toCatalogProduct(row) };
    },
  };
}

export type * from "./types";
