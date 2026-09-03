import type { agentActions, conversations, messages } from "./agent";
import type { recommendationEvents } from "./analytics";
import type { auditEvents } from "./audit";
import type { cartItems, carts } from "./cart";
import type {
  checkoutApprovals,
  checkoutProposals,
  orderItems,
  orders,
  paymentAttempts,
  providerNotifications,
  providerOperations,
  providerOrders,
  providerPayments,
} from "./checkout";
import type { productRelations, products } from "./catalog";
import type { brands, guestSessions } from "./identity";

export type JsonObject = Record<string, unknown>;

export type Brand = typeof brands.$inferSelect;
export type NewBrand = typeof brands.$inferInsert;
export type GuestSession = typeof guestSessions.$inferSelect;
export type NewGuestSession = typeof guestSessions.$inferInsert;

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type ProductRelation = typeof productRelations.$inferSelect;
export type NewProductRelation = typeof productRelations.$inferInsert;

export type Cart = typeof carts.$inferSelect;
export type NewCart = typeof carts.$inferInsert;
export type CartItem = typeof cartItems.$inferSelect;
export type NewCartItem = typeof cartItems.$inferInsert;

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

export type CheckoutProposalRow = typeof checkoutProposals.$inferSelect;
export type NewCheckoutProposalRow = typeof checkoutProposals.$inferInsert;
export type CheckoutApprovalRow = typeof checkoutApprovals.$inferSelect;
export type NewCheckoutApprovalRow = typeof checkoutApprovals.$inferInsert;
export type OrderRow = typeof orders.$inferSelect;
export type NewOrderRow = typeof orders.$inferInsert;
export type OrderItemRow = typeof orderItems.$inferSelect;
export type NewOrderItemRow = typeof orderItems.$inferInsert;
export type ProviderOperationRow = typeof providerOperations.$inferSelect;
export type NewProviderOperationRow = typeof providerOperations.$inferInsert;
export type ProviderOrderRow = typeof providerOrders.$inferSelect;
export type NewProviderOrderRow = typeof providerOrders.$inferInsert;
export type PaymentAttemptRow = typeof paymentAttempts.$inferSelect;
export type NewPaymentAttemptRow = typeof paymentAttempts.$inferInsert;
export type ProviderPaymentRow = typeof providerPayments.$inferSelect;
export type NewProviderPaymentRow = typeof providerPayments.$inferInsert;
export type ProviderNotificationRow = typeof providerNotifications.$inferSelect;
export type NewProviderNotificationRow =
  typeof providerNotifications.$inferInsert;
