import { createConversationModule } from "@/modules/agent/conversation";
import { createCartModule } from "@/modules/cart/cart";
import { requireBrand } from "@/modules/identity/brand";
import { resolveCustomerContext } from "@/modules/identity/customer-context";
import { resolveUserContext } from "@/modules/identity/user-context";
import { createPostHandler } from "./handler";

async function createCommandModules() {
  const [brand, { userId }, { customerId }] = await Promise.all([
    requireBrand(),
    resolveUserContext(),
    resolveCustomerContext(),
  ]);
  return {
    conversation: createConversationModule(userId),
    cart: createCartModule(customerId, brand.currency),
  };
}

export const POST = createPostHandler(createCommandModules);
