import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { merchants } from "@/db/schema/identity";
import { isUuid } from "@/lib/validation";

export type MerchantContext = {
  merchantId: string;
};

export async function resolveMerchantContext(): Promise<MerchantContext> {
  const configuredMerchantId = process.env.MERCHANT_ID;

  if (configuredMerchantId) {
    if (!isUuid(configuredMerchantId)) {
      throw new Error("MERCHANT_ID must be a UUID");
    }

    const [merchant] = await db
      .select({ id: merchants.id })
      .from(merchants)
      .where(eq(merchants.id, configuredMerchantId))
      .limit(1);

    if (!merchant) {
      throw new Error("The configured MERCHANT_ID does not exist");
    }

    return { merchantId: merchant.id };
  }

  const availableMerchants = await db
    .select({ id: merchants.id })
    .from(merchants)
    .orderBy(asc(merchants.id))
    .limit(2);

  if (availableMerchants.length !== 1) {
    throw new Error(
      "MERCHANT_ID is required unless the database contains exactly one merchant",
    );
  }

  return { merchantId: availableMerchants[0].id };
}
