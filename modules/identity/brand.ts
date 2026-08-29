import { db } from "@/db";
import { brands } from "@/db/schema/identity";

export type BrandIdentity = {
  id: string;
  name: string;
  slug: string;
  description: string;
  logoUrl: string | null;
  currency: string;
};

export class BrandConfigurationError extends Error {
  constructor() {
    super("Exactly one Brand must be configured for this Storefront.");
    this.name = "BrandConfigurationError";
  }
}

export async function requireBrand(): Promise<BrandIdentity> {
  const configuredBrands = await db
    .select({
      id: brands.id,
      name: brands.name,
      slug: brands.slug,
      description: brands.description,
      logoUrl: brands.logoUrl,
      currency: brands.currency,
    })
    .from(brands)
    .limit(2);

  if (configuredBrands.length !== 1) {
    throw new BrandConfigurationError();
  }

  return configuredBrands[0];
}
