import type { agentActions, conversations, messages } from "./agent";
import type { recommendationEvents } from "./analytics";
import type { auditEvents } from "./audit";
import type { cartItems, carts } from "./cart";
import type { productRelations, products, productVariants } from "./catalog";
import type {
  approvals,
  checkoutProposalItems,
  checkoutProposals,
  policies,
  policyEvaluations,
} from "./checkout";
import type { merchantAdmins, merchants, users } from "./identity";
import type { orderItems, orders } from "./ordering";
import type { paymentAttempts, webhookEvents } from "./payments";

export type JsonObject = Record<string, unknown>;

export type Merchant = typeof merchants.$inferSelect;
export type NewMerchant = typeof merchants.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type MerchantAdmin = typeof merchantAdmins.$inferSelect;
export type NewMerchantAdmin = typeof merchantAdmins.$inferInsert;

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type ProductVariant = typeof productVariants.$inferSelect;
export type NewProductVariant = typeof productVariants.$inferInsert;
export type ProductRelation = typeof productRelations.$inferSelect;
export type NewProductRelation = typeof productRelations.$inferInsert;

export type Cart = typeof carts.$inferSelect;
export type NewCart = typeof carts.$inferInsert;
export type CartItem = typeof cartItems.$inferSelect;
export type NewCartItem = typeof cartItems.$inferInsert;

export type Policy = typeof policies.$inferSelect;
export type NewPolicy = typeof policies.$inferInsert;
export type CheckoutProposal = typeof checkoutProposals.$inferSelect;
export type NewCheckoutProposal = typeof checkoutProposals.$inferInsert;
export type CheckoutProposalItem = typeof checkoutProposalItems.$inferSelect;
export type NewCheckoutProposalItem = typeof checkoutProposalItems.$inferInsert;
export type PolicyEvaluation = typeof policyEvaluations.$inferSelect;
export type NewPolicyEvaluation = typeof policyEvaluations.$inferInsert;
export type Approval = typeof approvals.$inferSelect;
export type NewApproval = typeof approvals.$inferInsert;

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type OrderItem = typeof orderItems.$inferSelect;
export type NewOrderItem = typeof orderItems.$inferInsert;

export type PaymentAttempt = typeof paymentAttempts.$inferSelect;
export type NewPaymentAttempt = typeof paymentAttempts.$inferInsert;
export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type NewWebhookEvent = typeof webhookEvents.$inferInsert;

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type AgentAction = typeof agentActions.$inferSelect;
export type NewAgentAction = typeof agentActions.$inferInsert;

export type RecommendationEvent = typeof recommendationEvents.$inferSelect;
export type NewRecommendationEvent = typeof recommendationEvents.$inferInsert;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type NewAuditEvent = typeof auditEvents.$inferInsert;
