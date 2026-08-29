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
  CatalogProduct,
  CatalogSearch,
  CatalogSearchResult,
  ProductDetailResult,
} from "./types";
import { escapeLikePattern } from "@/lib/validation";

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

export interface CatalogModule {
  search(input: CatalogSearch): Promise<CatalogSearchResult>;
  getProduct(productId: string): Promise<ProductDetailResult>;
}

export function createCatalogModule(): CatalogModule {
  return {
    async search(input: CatalogSearch): Promise<CatalogSearchResult> {
      const filters: SQL[] = [eq(products.active, true)];

      if (input.query !== undefined) {
        const pattern = `%${escapeLikePattern(input.query)}%`;
        const textMatch = or(
          ilike(products.name, pattern),
          ilike(products.description, pattern),
          ilike(products.slug, pattern),
        );
        if (textMatch) filters.push(textMatch);
      }
      if (input.queries !== undefined) {
        const relatedMatches = input.queries
          .map((query) => query.trim())
          .filter((query) => query.length > 0)
          .map((query) => {
            const pattern = `%${escapeLikePattern(query)}%`;
            return or(
              ilike(products.name, pattern),
              ilike(products.description, pattern),
              ilike(products.slug, pattern),
            );
          })
          .filter((match): match is SQL => match !== undefined);
        const relatedTextMatch = or(...relatedMatches);
        if (relatedTextMatch) filters.push(relatedTextMatch);
      }
      if (input.productTypes !== undefined) {
        const productTypeMatches = input.productTypes
          .map((productType) => productType.trim())
          .filter((productType) => productType.length > 0)
          .map((productType) => {
            const pattern = `%${escapeLikePattern(productType)}%`;
            return or(
              ilike(products.name, pattern),
              ilike(products.description, pattern),
              ilike(products.slug, pattern),
            );
          })
          .filter((match): match is SQL => match !== undefined);
        const productTypeMatch = or(...productTypeMatches);
        if (productTypeMatch) filters.push(productTypeMatch);
      }
      if (input.useCases !== undefined) {
        const useCaseMatches = input.useCases
          .map((useCase) => useCase.trim())
          .filter((useCase) => useCase.length > 0)
          .map((useCase) => {
            const pattern = `%${escapeLikePattern(useCase)}%`;
            return or(
              ilike(products.description, pattern),
              sql`exists (
                select 1
                from jsonb_array_elements_text(
                  coalesce(${products.attributes}->'useCases', '[]'::jsonb)
                ) as use_case(value)
                where use_case.value ilike ${pattern}
              )`,
            );
          })
          .filter((match): match is SQL => match !== undefined);
        const useCaseMatch = or(...useCaseMatches);
        if (useCaseMatch) filters.push(useCaseMatch);
      }
      if (input.features !== undefined) {
        const featureMatches = input.features
          .map((feature) => feature.trim())
          .filter((feature) => feature.length > 0)
          .map((feature) => {
            const pattern = `%${escapeLikePattern(feature)}%`;
            return or(
              ilike(products.name, pattern),
              ilike(products.description, pattern),
              ilike(products.slug, pattern),
              sql`${products.attributes}::text ilike ${pattern}`,
            );
          })
          .filter((match): match is SQL => match !== undefined);
        const featureMatch = or(...featureMatches);
        if (featureMatch) filters.push(featureMatch);
      }
      if (input.category !== undefined) {
        filters.push(
          ilike(products.category, escapeLikePattern(input.category)),
        );
      }
      if (input.minPriceMinor !== undefined) {
        filters.push(gte(products.priceMinor, input.minPriceMinor));
      }
      if (input.maxPriceMinor !== undefined) {
        filters.push(lte(products.priceMinor, input.maxPriceMinor));
      }
      if (input.size !== undefined) {
        filters.push(sql`exists (
          select 1
          from jsonb_array_elements_text(
            coalesce(${products.attributes}->'sizes', '[]'::jsonb)
          ) as available_size(value)
          where lower(available_size.value) = lower(${input.size})
        )`);
      }
      if (input.inStockOnly === true) {
        filters.push(gt(products.stock, 0));
      }
      if (input.attributes !== undefined) {
        for (const [key, value] of Object.entries(input.attributes)) {
          filters.push(
            typeof value === "string"
              ? sql`lower(${products.attributes}->>${key}) = lower(${value})`
              : sql`${products.attributes} @> ${JSON.stringify({ [key]: value })}::jsonb`,
          );
        }
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
          and(eq(products.id, productId), eq(products.active, true)),
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
