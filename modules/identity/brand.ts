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

/**
 * Reads the Brand once and keeps the answer for the life of the process.
 *
 * Each deployment serves exactly one Brand and that row does not change within
 * a deployment, so re-reading it on every Conversation Turn spends a database
 * round trip on an answer that cannot have changed. A failed read is not kept:
 * a Storefront that starts before its Brand row exists recovers without a
 * restart.
 *
 * @param readBrand - Reads the configured Brand from storage.
 * @returns The process-wide Brand reader.
 */
export function createBrandReader(
  readBrand: () => Promise<BrandIdentity>,
): () => Promise<BrandIdentity> {
  let configuredBrand: Promise<BrandIdentity> | null = null;
  return () => {
    configuredBrand ??= readBrand().catch((error: unknown) => {
      configuredBrand = null;
      throw error;
    });
    return configuredBrand;
  };
}

export const requireBrand: () => Promise<BrandIdentity> =
  createBrandReader(readConfiguredBrand);

async function readConfiguredBrand(): Promise<BrandIdentity> {
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
