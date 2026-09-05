import type { Metadata } from "next";
import { connection } from "next/server";
import { requireBrand } from "@/modules/identity/brand";
import { ShoppingAssistant } from "./shopping-assistant";

export async function generateMetadata(): Promise<Metadata> {
  const brand = await requireBrand();
  return {
    title: `${brand.name} — ${brand.description}`,
    description: brand.description,
  };
}

export default async function Home() {
  await connection();
  const brand = await requireBrand();
  return (
    <ShoppingAssistant
      brandName={brand.name}
      brandDescription={brand.description}
      resumeConversation
    />
  );
}
