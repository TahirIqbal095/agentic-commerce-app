import type { Metadata } from "next";
import { connection } from "next/server";
import { requireBrand } from "@/modules/identity/brand";
import { resolveUserContext } from "@/modules/identity/user-context";
import { createConversationState } from "@/modules/agent/conversation-state";
import { ShoppingAssistant } from "./shopping-assistant";

export async function generateMetadata(): Promise<Metadata> {
  const brand = await requireBrand();
  return {
    title: `${brand.name} | Agentic Commerce Storefront`,
    description: brand.description,
  };
}

export default async function Home() {
  await connection();
  const [brand, { userId }] = await Promise.all([
    requireBrand(),
    resolveUserContext(),
  ]);
  const initialConversation =
    await createConversationState(userId).loadCurrent();
  return (
    <ShoppingAssistant
      brandName={brand.name}
      initialConversation={initialConversation}
    />
  );
}
