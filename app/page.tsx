import type { Metadata } from "next";
import { connection } from "next/server";
import {
  createCatalogModule,
  type CatalogCategory,
} from "@/modules/catalog/catalog";
import { requireBrand } from "@/modules/identity/brand";
import { ShoppingAssistant } from "./shopping-assistant";

export async function generateMetadata(): Promise<Metadata> {
  const brand = await requireBrand();
  return {
    title: `${brand.name} — ${brand.description}`,
    description: brand.description,
  };
}

/**
 * What the Catalog offers, or nothing.
 *
 * A Catalog with no active Products is a live condition rather than a
 * hypothetical: the seed deactivates every Product before reinserting. Neither
 * that nor a failed read is worth a broken Storefront, so the category strip
 * goes missing and the headline and the composer carry on. A missing Brand
 * still fails loudly, because a Storefront with no Brand has nothing to say.
 */
async function readCatalogCategories(): Promise<CatalogCategory[]> {
  try {
    return await createCatalogModule().listCategories();
  } catch {
    return [];
  }
}

export default async function Home() {
  await connection();
  const [brand, categories] = await Promise.all([
    requireBrand(),
    readCatalogCategories(),
  ]);
  return (
    <ShoppingAssistant
      brandName={brand.name}
      brandDescription={brand.description}
      categories={categories}
      resumeConversation
    />
  );
}
