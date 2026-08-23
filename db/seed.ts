import { db } from "@/db";
import { products } from "@/db/schema/catalog";
import { merchants } from "@/db/schema/identity";
import type { NewProduct } from "@/db/schema/types";

export const DEMO_MERCHANT_ID = "11111111-1111-4111-8111-111111111111";

const DEMO_PRODUCTS = [
  {
    id: "20000000-0000-4000-8000-000000000001",
    merchantId: DEMO_MERCHANT_ID,
    name: "AeroTune Wireless Headphones",
    slug: "aerotune-wireless-headphones",
    description: "Over-ear wireless headphones with active noise cancellation.",
    category: "Audio",
    priceMinor: 449900,
    currency: "INR",
    stock: 24,
    active: true,
    attributes: { brand: "AeroTune", color: "Black", wireless: true },
  },
  {
    id: "20000000-0000-4000-8000-000000000002",
    merchantId: DEMO_MERCHANT_ID,
    name: "Pocket Bluetooth Speaker",
    slug: "pocket-bluetooth-speaker",
    description: "Compact portable speaker with twelve-hour battery life.",
    category: "Audio",
    priceMinor: 199900,
    currency: "INR",
    stock: 0,
    active: true,
    attributes: { brand: "AeroTune", color: "Blue", wireless: true },
  },
  {
    id: "20000000-0000-4000-8000-000000000003",
    merchantId: DEMO_MERCHANT_ID,
    name: "Sprint Running Shoes",
    slug: "sprint-running-shoes",
    description: "Lightweight road-running shoes with responsive cushioning.",
    category: "Fitness",
    priceMinor: 329900,
    currency: "INR",
    stock: 18,
    active: true,
    attributes: { brand: "Sprint", color: "White", size: "UK 9" },
  },
  {
    id: "20000000-0000-4000-8000-000000000004",
    merchantId: DEMO_MERCHANT_ID,
    name: "Commuter Backpack",
    slug: "commuter-backpack",
    description: "Water-resistant backpack with a padded laptop compartment.",
    category: "Bags",
    priceMinor: 249900,
    currency: "INR",
    stock: 12,
    active: true,
    attributes: { color: "Olive", capacityLitres: 22, laptopSizeInches: 15 },
  },
  {
    id: "20000000-0000-4000-8000-000000000005",
    merchantId: DEMO_MERCHANT_ID,
    name: "Pulse Smart Watch",
    slug: "pulse-smart-watch",
    description: "Fitness-focused smart watch with GPS and heart-rate tracking.",
    category: "Wearables",
    priceMinor: 599900,
    currency: "INR",
    stock: 9,
    active: true,
    attributes: { color: "Graphite", gps: true, waterproof: true },
  },
  {
    id: "20000000-0000-4000-8000-000000000006",
    merchantId: DEMO_MERCHANT_ID,
    name: "Compact Coffee Maker",
    slug: "compact-coffee-maker",
    description: "Space-saving drip coffee maker for up to four cups.",
    category: "Home",
    priceMinor: 179900,
    currency: "INR",
    stock: 15,
    active: true,
    attributes: { color: "Black", capacityCups: 4 },
  },
  {
    id: "20000000-0000-4000-8000-000000000007",
    merchantId: DEMO_MERCHANT_ID,
    name: "Classic Wired Earbuds",
    slug: "classic-wired-earbuds",
    description: "Archived wired earbuds retained for catalog filtering checks.",
    category: "Audio",
    priceMinor: 69900,
    currency: "INR",
    stock: 30,
    active: false,
    attributes: { color: "White", wireless: false },
  },
] satisfies NewProduct[];

export async function seedDemoCatalog(): Promise<void> {
  const now = new Date();

  await db.transaction(async (transaction) => {
    await transaction
      .insert(merchants)
      .values({
        id: DEMO_MERCHANT_ID,
        name: "Agentic Commerce Demo",
        slug: "agentic-commerce-demo",
        currency: "INR",
      })
      .onConflictDoUpdate({
        target: merchants.id,
        set: {
          name: "Agentic Commerce Demo",
          slug: "agentic-commerce-demo",
          currency: "INR",
          updatedAt: now,
        },
      });

    for (const product of DEMO_PRODUCTS) {
      await transaction
        .insert(products)
        .values(product)
        .onConflictDoUpdate({
          target: [products.merchantId, products.slug],
          set: {
            name: product.name,
            description: product.description,
            category: product.category,
            priceMinor: product.priceMinor,
            currency: product.currency,
            stock: product.stock,
            active: product.active,
            attributes: product.attributes,
            updatedAt: now,
          },
        });
    }
  });
}
