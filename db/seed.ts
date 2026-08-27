import { eq } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema/catalog";
import { merchants, users } from "@/db/schema/identity";
import type { NewProduct } from "@/db/schema/types";

export const DEMO_MERCHANT_ID = "11111111-1111-4111-8111-111111111111";
export const DEMO_USER_ID = "12000000-0000-4000-8000-000000000001";

const DEMO_PRODUCTS = [
  {
    id: "21000000-0000-4000-8000-000000000001",
    merchantId: DEMO_MERCHANT_ID,
    name: "StrideFlow Daily Running Shoes",
    slug: "strideflow-daily-running-shoes",
    description:
      "Lightweight road-running shoes for daily training, with responsive cushioning and a breathable mesh upper.",
    category: "Footwear",
    priceMinor: 399900,
    currency: "INR",
    stock: 32,
    active: true,
    attributes: {
      brand: "StrideFlow",
      audience: "Unisex",
      colors: ["Midnight Blue", "Cloud White"],
      sizes: ["UK 6", "UK 7", "UK 8", "UK 9", "UK 10", "UK 11"],
      useCases: ["road running", "daily training"],
      surface: "Road",
      cushioning: "Responsive",
      support: "Neutral",
    },
  },
  {
    id: "21000000-0000-4000-8000-000000000002",
    merchantId: DEMO_MERCHANT_ID,
    name: "TrailCrest Grip Running Shoes",
    slug: "trailcrest-grip-running-shoes",
    description:
      "Protective trail-running shoes with deep-lug grip, a rock plate, and stable cushioning for uneven terrain.",
    category: "Footwear",
    priceMinor: 549900,
    currency: "INR",
    stock: 18,
    active: true,
    attributes: {
      brand: "TrailCrest",
      audience: "Unisex",
      colors: ["Forest Green", "Charcoal"],
      sizes: ["UK 7", "UK 8", "UK 9", "UK 10", "UK 11"],
      useCases: ["trail running", "hiking"],
      surface: "Trail",
      cushioning: "Stable",
      support: "Neutral",
      waterResistant: true,
    },
  },
  {
    id: "21000000-0000-4000-8000-000000000003",
    merchantId: DEMO_MERCHANT_ID,
    name: "CloudStep Walking Shoes",
    slug: "cloudstep-walking-shoes",
    description:
      "Soft, wide-fit walking shoes with plush cushioning for commuting, travel, and all-day comfort.",
    category: "Footwear",
    priceMinor: 279900,
    currency: "INR",
    stock: 0,
    active: true,
    attributes: {
      brand: "CloudStep",
      audience: "Unisex",
      colors: ["Stone Grey", "Navy"],
      sizes: ["UK 6", "UK 7", "UK 8", "UK 9", "UK 10"],
      useCases: ["walking", "travel", "all-day wear"],
      cushioning: "Plush",
      fit: "Wide",
      support: "Neutral",
    },
  },
  {
    id: "21000000-0000-4000-8000-000000000004",
    merchantId: DEMO_MERCHANT_ID,
    name: "FlexForge Training Shoes",
    slug: "flexforge-training-shoes",
    description:
      "Stable gym trainers with a flat heel, flexible forefoot, and lateral support for strength and circuit workouts.",
    category: "Footwear",
    priceMinor: 429900,
    currency: "INR",
    stock: 21,
    active: true,
    attributes: {
      brand: "FlexForge",
      audience: "Unisex",
      colors: ["Black", "Gum"],
      sizes: ["UK 6", "UK 7", "UK 8", "UK 9", "UK 10", "UK 11"],
      useCases: ["gym training", "strength training", "circuit workouts"],
      cushioning: "Firm",
      support: "Lateral",
      heelDropMm: 4,
    },
  },
  {
    id: "21000000-0000-4000-8000-000000000005",
    merchantId: DEMO_MERCHANT_ID,
    name: "CourtLine Casual Sneakers",
    slug: "courtline-casual-sneakers",
    description:
      "Clean low-top sneakers with a cushioned footbed for casual outfits, college, and everyday city wear.",
    category: "Footwear",
    priceMinor: 349900,
    currency: "INR",
    stock: 27,
    active: true,
    attributes: {
      brand: "CourtLine",
      audience: "Unisex",
      colors: ["White", "Black"],
      sizes: ["UK 5", "UK 6", "UK 7", "UK 8", "UK 9", "UK 10"],
      useCases: ["casual wear", "college", "everyday wear"],
      material: "Synthetic leather",
      cushioning: "Moderate",
    },
  },
  {
    id: "21000000-0000-4000-8000-000000000006",
    merchantId: DEMO_MERCHANT_ID,
    name: "Heritage Oxford Formal Shoes",
    slug: "heritage-oxford-formal-shoes",
    description:
      "Polished lace-up Oxford shoes in full-grain leather for office wear, interviews, and formal occasions.",
    category: "Footwear",
    priceMinor: 499900,
    currency: "INR",
    stock: 14,
    active: true,
    attributes: {
      brand: "Heritage",
      audience: "Men",
      colors: ["Black", "Dark Brown"],
      sizes: ["UK 7", "UK 8", "UK 9", "UK 10", "UK 11"],
      useCases: ["office wear", "formal occasions"],
      material: "Full-grain leather",
      closure: "Lace-up",
    },
  },
  {
    id: "21000000-0000-4000-8000-000000000007",
    merchantId: DEMO_MERCHANT_ID,
    name: "Everyday Comfort Sandals",
    slug: "everyday-comfort-sandals",
    description:
      "Adjustable everyday sandals with a contoured footbed and grippy sole for errands and warm-weather travel.",
    category: "Footwear",
    priceMinor: 189900,
    currency: "INR",
    stock: 19,
    active: true,
    attributes: {
      brand: "EaseWalk",
      audience: "Unisex",
      colors: ["Tan", "Black"],
      sizes: ["UK 5", "UK 6", "UK 7", "UK 8", "UK 9", "UK 10"],
      useCases: ["casual wear", "travel"],
      closure: "Adjustable straps",
      waterResistant: true,
    },
  },
  {
    id: "21000000-0000-4000-8000-000000000008",
    merchantId: DEMO_MERCHANT_ID,
    name: "Performance Ankle Socks",
    slug: "performance-ankle-socks",
    description:
      "Three pairs of breathable ankle socks with arch support and moisture-wicking yarn for running and training.",
    category: "Accessories",
    priceMinor: 69900,
    currency: "INR",
    stock: 48,
    active: true,
    attributes: {
      brand: "StrideFlow",
      audience: "Unisex",
      colors: ["Black", "White", "Grey"],
      sizes: ["S-M", "L-XL"],
      useCases: ["running", "gym training"],
      packSize: 3,
      moistureWicking: true,
    },
  },
  {
    id: "21000000-0000-4000-8000-000000000009",
    merchantId: DEMO_MERCHANT_ID,
    name: "Cushioned Crew Socks",
    slug: "cushioned-crew-socks",
    description:
      "Two pairs of soft crew socks with heel and toe cushioning for walking shoes, sneakers, and boots.",
    category: "Accessories",
    priceMinor: 59900,
    currency: "INR",
    stock: 36,
    active: true,
    attributes: {
      brand: "CloudStep",
      audience: "Unisex",
      colors: ["Navy", "Oatmeal"],
      sizes: ["S-M", "L-XL"],
      useCases: ["walking", "everyday wear"],
      packSize: 2,
      cushioning: "Heel and toe",
    },
  },
  {
    id: "21000000-0000-4000-8000-000000000010",
    merchantId: DEMO_MERCHANT_ID,
    name: "Support Gel Insoles",
    slug: "support-gel-insoles",
    description:
      "Trim-to-fit gel insoles with heel cushioning and medium arch support for walking, work, and everyday shoes.",
    category: "Accessories",
    priceMinor: 99900,
    currency: "INR",
    stock: 25,
    active: true,
    attributes: {
      brand: "CloudStep",
      audience: "Unisex",
      sizes: ["UK 4-7", "UK 8-11"],
      useCases: ["walking", "all-day wear"],
      archSupport: "Medium",
      trimToFit: true,
    },
  },
  {
    id: "21000000-0000-4000-8000-000000000011",
    merchantId: DEMO_MERCHANT_ID,
    name: "Reflective Running Laces",
    slug: "reflective-running-laces",
    description:
      "Reflective replacement laces that improve visibility during early-morning and evening road runs.",
    category: "Accessories",
    priceMinor: 34900,
    currency: "INR",
    stock: 42,
    active: true,
    attributes: {
      brand: "StrideFlow",
      colors: ["Volt Yellow", "Silver"],
      useCases: ["road running", "low-light running"],
      lengthCm: 120,
      reflective: true,
    },
  },
  {
    id: "21000000-0000-4000-8000-000000000012",
    merchantId: DEMO_MERCHANT_ID,
    name: "Complete Shoe Care Kit",
    slug: "complete-shoe-care-kit",
    description:
      "A gentle cleaner, brush, microfiber cloth, and protector spray for sneakers and everyday footwear.",
    category: "Accessories",
    priceMinor: 129900,
    currency: "INR",
    stock: 16,
    active: true,
    attributes: {
      brand: "FreshStep",
      useCases: ["shoe cleaning", "shoe protection"],
      suitableMaterials: ["Mesh", "Canvas", "Synthetic leather"],
      pieceCount: 4,
    },
  },
  {
    id: "21000000-0000-4000-8000-000000000013",
    merchantId: DEMO_MERCHANT_ID,
    name: "TempoLite Racing Shoes",
    slug: "tempolite-racing-shoes",
    description:
      "Archived lightweight racing shoes retained to verify that inactive products stay out of the live catalog.",
    category: "Footwear",
    priceMinor: 649900,
    currency: "INR",
    stock: 5,
    active: false,
    attributes: {
      brand: "StrideFlow",
      audience: "Unisex",
      useCases: ["road racing"],
      surface: "Road",
    },
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

    await transaction
      .insert(users)
      .values({
        id: DEMO_USER_ID,
        email: "customer@agentic-commerce.demo",
        name: "Demo Customer",
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: "customer@agentic-commerce.demo",
          name: "Demo Customer",
          updatedAt: now,
        },
      });

    await transaction
      .update(products)
      .set({ active: false, updatedAt: now })
      .where(eq(products.merchantId, DEMO_MERCHANT_ID));

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
