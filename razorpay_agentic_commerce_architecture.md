# AI Growth & Agentic Commerce — Complete System Architecture

## 1. Executive Summary

This project is an **AI-powered commerce platform for a Razorpay merchant** that supports two related goals:

1. **Grow merchant revenue** using AI-assisted product discovery, upselling, cross-selling, and personalized recommendations.
2. **Make the merchant transactable by an AI buyer end-to-end**, meaning an AI agent can discover products, build a cart, request checkout, obtain user authorization, and initiate a Razorpay test-mode payment safely.

The system is intentionally designed so that the **LLM never directly performs money movement**.

Instead, all financial and commerce actions flow through:

```text
User Intent
   ↓
Commerce Agent
   ↓
Typed Tool Call
   ↓
Policy / Guardrail Engine
   ↓
Approval Gate (when required)
   ↓
Trusted Business Service
   ↓
Razorpay Test-Mode API
   ↓
Verification
   ↓
Audit Trail
```

The architectural principles are:

- **LLM for reasoning, not authority**
- **Deterministic business logic for money**
- **Explicit user authorization before payment**
- **Policy-bounded actions**
- **Full auditability**
- **Idempotent and retry-safe payment operations**
- **Graceful handling of failures**
- **Agent-readable merchant catalog**
- **Shared service layer for both human UI and AI agent**

---

# 2. Product Vision

The product behaves like an AI commerce operating layer for a merchant.

A customer should be able to say:

> “I need wireless headphones under ₹5,000 with good battery life.”

The agent should:

1. Understand the request.
2. Search a structured merchant catalog.
3. Return suitable products.
4. Explain why each product matches.
5. Add a selected item to cart.
6. Recommend a relevant cross-sell or upsell.
7. Respect budget and merchant policies.
8. Validate inventory and prepare a final-price checkout proposal.
9. Ask for explicit approval.
10. Create a Razorpay order in test mode.
11. Complete and verify payment.
12. Create an internal merchant order.
13. Record every important action in an audit trail.

The merchant should also have an admin dashboard where they can:

- manage products,
- view orders,
- configure agent limits,
- define discount and payment policies,
- inspect recommendations,
- inspect approval requests,
- inspect audit events,
- see revenue impact from agent recommendations.

---

# 3. Core Architecture Principles

## 3.1 The AI Agent Is Not the Source of Truth

The LLM may decide:

```text
"Add product prod_123 to the cart."
```

But it must not decide:

```text
"The price is ₹4,499."
```

The actual product price must come from the database.

The same rule applies to:

- stock,
- cart totals,
- discounts,
- taxes,
- order amount,
- payment status,
- refund status,
- merchant policy,
- authorization state.

---

## 3.2 The LLM Never Calls Razorpay Directly

Incorrect:

```text
LLM
 ↓
Razorpay API
```

Correct:

```text
LLM
 ↓
Typed commerce tool
 ↓
Policy engine
 ↓
Approval gate
 ↓
Payment service
 ↓
Razorpay adapter
 ↓
Razorpay API
```

---

## 3.3 Every Money Action Must Be

### Explainable

The system must be able to answer:

- What action was attempted?
- Why did the agent propose it?
- What amount was involved?
- Which user or merchant authorized it?
- Which policies were evaluated?
- What happened afterward?

### Bounded

Examples:

```text
maximum transaction amount: ₹10,000
maximum automatic discount: 10%
maximum merchant discount: 20%
payment requires confirmation: true
refund above ₹500 requires merchant approval
```

### Gated

Certain actions cannot proceed without explicit authorization.

Example:

```text
Search products       → automatic
Read cart             → automatic
Add to cart           → automatic
Recommend cross-sell  → automatic
Apply small discount  → policy dependent
Create payment        → user approval required
Refund payment        → merchant approval required
```

---

# 4. High-Level System Architecture

```text
┌──────────────────────────────────────────────────────────────────────┐
│                              CLIENTS                                 │
│                                                                      │
│  Customer Storefront   AI Chat Interface   Merchant Admin Dashboard │
│                                                                      │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ HTTPS
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       APPLICATION / API LAYER                        │
│                                                                      │
│ Auth │ Products │ Cart │ Orders │ Payments │ Admin │ Agent Endpoint │
│                                                                      │
└──────────────────────┬───────────────────────┬───────────────────────┘
                       │                       │
                       │                       │
                       ▼                       ▼
        ┌──────────────────────────┐   ┌─────────────────────────────┐
        │       AGENT LAYER        │   │   DOMAIN SERVICE LAYER      │
        │                          │   │                             │
        │ Commerce Agent           │   │ ProductService              │
        │ LLM                      │   │ CartService                 │
        │ Tool Registry            │   │ InventoryService            │
        │ Recommendation Logic     │   │ PricingService              │
        │ Conversation Context     │   │ OrderService                │
        │                          │   │ PaymentService              │
        └────────────┬─────────────┘   │ RecommendationService       │
                     │                 │ ApprovalService             │
                     │ proposed action │ AuditService                │
                     ▼                 └──────────────┬──────────────┘
        ┌──────────────────────────┐                  │
        │ POLICY / GUARDRAIL LAYER │                  │
        │                          │                  │
        │ Spending policies        │                  │
        │ Discount policies        │                  │
        │ Approval requirements    │                  │
        │ Merchant boundaries      │                  │
        │ Revalidation rules       │                  │
        │ Risk checks              │                  │
        └────────────┬─────────────┘                  │
                     │                                │
                     └──────────────┬─────────────────┘
                                    ▼
                     ┌────────────────────────────┐
                     │     INTEGRATION LAYER      │
                     │                            │
                     │ Razorpay Adapter           │
                     │ LLM Provider Adapter       │
                     │ Webhook Handler            │
                     └──────────────┬─────────────┘
                                    │
                    ┌───────────────┴────────────────┐
                    ▼                                ▼
          ┌──────────────────┐            ┌─────────────────────┐
          │ Razorpay Test API │            │ LLM Provider API    │
          └──────────────────┘            └─────────────────────┘

                                    │
                                    ▼
                     ┌────────────────────────────┐
                     │        PERSISTENCE         │
                     │                            │
                     │ PostgreSQL                 │
                     │ Products                   │
                     │ Carts                      │
                     │ Orders                     │
                     │ Payments                   │
                     │ Policies                   │
                     │ Approvals                  │
                     │ Conversations              │
                     │ Agent Actions              │
                     │ Audit Events               │
                     └────────────────────────────┘
```

---

# 5. Recommended Technology Stack

## Frontend

```text
Next.js
React
TypeScript
Tailwind CSS
```

Optional UI libraries:

```text
shadcn/ui
Radix UI
```

## Backend

Recommended for an assignment:

```text
Next.js Route Handlers
Next.js Server Actions where appropriate
TypeScript
Zod
```

A separate backend is unnecessary unless you specifically want one.

## Database

```text
PostgreSQL
```

ORM:

```text
Drizzle ORM
```

or:

```text
Prisma
```

## AI

Use any provider with reliable structured tool calling.

Architecture should hide provider details behind an adapter:

```ts
interface LLMProvider {
  generateAgentResponse(input: AgentInput): Promise<AgentOutput>;
}
```

## Payments

```text
Razorpay Test Mode
Razorpay Orders API
Razorpay Checkout
Payment signature verification
Webhooks
```

---

# 6. Application Surfaces

The application should contain two major user experiences.

---

# 6.1 Customer Experience

Recommended routes:

```text
/
├── /shop
├── /products/[slug]
├── /assistant
├── /cart
├── /checkout
├── /orders
└── /orders/[id]
```

## `/shop`

Traditional storefront.

Purpose:

- browse products manually,
- demonstrate that the merchant still works normally,
- provide a comparison with AI-assisted shopping.

## `/assistant`

Primary agentic-commerce experience.

Capabilities:

- natural-language product discovery,
- preference understanding,
- budget awareness,
- recommendation explanation,
- add/remove cart items,
- cross-sell,
- checkout initiation,
- order lookup.

## `/cart`

Authoritative cart state.

The cart shown here must come from backend state rather than chat text.

## `/checkout`

Displays:

- authoritative items,
- latest prices,
- discounts,
- shipping,
- total,
- required approval,
- Razorpay checkout.

## `/orders/[id]`

Displays:

- order items,
- payment status,
- transaction state,
- audit summary.

---

# 6.2 Merchant Experience

Recommended routes:

```text
/admin
├── /admin/dashboard
├── /admin/products
├── /admin/orders
├── /admin/policies
├── /admin/approvals
├── /admin/recommendations
├── /admin/audit
└── /admin/analytics
```

## `/admin/dashboard`

Summary metrics:

```text
Revenue
Orders
Average order value
Agent-assisted orders
Agent recommendation acceptance
Cross-sell revenue
Payment success rate
Blocked agent actions
```

## `/admin/products`

CRUD for demo merchant products.

## `/admin/orders`

Order management.

## `/admin/policies`

Merchant-defined safety limits.

Example:

```text
Max transaction amount
Max automatic discount
Max merchant discount
Require user approval before payment
Refund approval threshold
Maximum cart increase from upsell
```

## `/admin/approvals`

Pending/rejected/approved sensitive actions.

## `/admin/audit`

Chronological trace of:

- user requests,
- agent decisions,
- tool calls,
- policy evaluations,
- approvals,
- payment attempts,
- payment results,
- failures.

## `/admin/analytics`

Shows whether the AI actually improved revenue.

Example:

```text
Average cart before recommendation: ₹3,850
Average cart after accepted recommendation: ₹4,430
Incremental AOV: +15.1%
```

---

# 7. Domain Model

The major domain entities are:

```text
Merchant
User
Product
ProductRelation
Cart
CartItem
Order
OrderItem
Payment
Conversation
Message
AgentAction
Policy
PolicyEvaluation
Approval
AuditEvent
RecommendationEvent
```

---

# 8. Database Schema

A practical relational design follows.

---

## 8.1 merchants

```text
id
name
slug
currency
created_at
updated_at
```

---

## 8.2 users

```text
id
email
name
created_at
updated_at
```

Every user can shop as a customer. Merchant administration is granted through a
merchant-specific membership rather than a global user role.

---

## 8.3 merchant_admins

```text
merchant_id
user_id
created_at
```

One user may administer multiple merchants, and one merchant may have multiple
administrators.

---

## 8.4 products

```text
id
merchant_id
name
slug
description
category
price
currency
stock
active
metadata_json
created_at
updated_at
```

`metadata_json` can hold agent-useful structured attributes:

```json
{
  "wireless": true,
  "batteryHours": 40,
  "noiseCancellation": true
}
```

---

## 8.5 product_relations

Supports upsell/cross-sell.

```text
id
product_id
related_product_id
relation_type
score
reason
created_at
```

Relation types:

```text
CROSS_SELL
UPSELL
BUNDLE
ACCESSORY
ALTERNATIVE
```

---

## 8.6 carts

```text
id
user_id
merchant_id
status
currency
created_at
updated_at
```

Statuses:

```text
ACTIVE
CHECKOUT_PENDING
CONVERTED
ABANDONED
```

---

## 8.7 cart_items

```text
id
cart_id
product_id
quantity
unit_price_snapshot
created_at
updated_at
```

`unit_price_snapshot` records the price displayed in the cart. Checkout preparation fixes the final payable price in an immutable proposal snapshot.

---

## 8.8 orders

```text
id
user_id
merchant_id
cart_id
status
currency
subtotal
discount
shipping
tax
total
created_at
updated_at
```

Statuses:

```text
PENDING
PAYMENT_PENDING
PAID
PAYMENT_FAILED
CANCELLED
FULFILLED
```

---

## 8.9 order_items

```text
id
order_id
product_id
name_snapshot
quantity
unit_price
total
created_at
```

Orders should use immutable snapshots.

---

## 8.10 payments

```text
id
order_id
provider
provider_order_id
provider_payment_id
amount
currency
status
failure_code
failure_reason
created_at
updated_at
```

Statuses:

```text
CREATED
PENDING
AUTHORIZED
CAPTURED
FAILED
REFUNDED
```

---

## 8.11 conversations

```text
id
user_id
merchant_id
created_at
updated_at
```

---

## 8.12 messages

```text
id
conversation_id
role
content
metadata_json
created_at
```

Roles:

```text
USER
ASSISTANT
TOOL
SYSTEM
```

---

## 8.13 agent_actions

This is one of the most important tables.

```text
id
conversation_id
user_id
merchant_id

action_type
tool_name

input_json
output_json

reason
status

money_impact
currency

created_at
```

Example action types:

```text
SEARCH_CATALOG
GET_PRODUCT
ADD_TO_CART
REMOVE_FROM_CART
RECOMMEND_PRODUCT
REQUEST_CHECKOUT
CREATE_PAYMENT
CHECK_ORDER_STATUS
```

---

## 8.14 policies

```text
id
merchant_id
policy_key
value_json
active
created_at
updated_at
```

Example keys:

```text
MAX_TRANSACTION_AMOUNT
MAX_AUTO_DISCOUNT_PERCENT
MAX_TOTAL_DISCOUNT_PERCENT
REQUIRE_PAYMENT_APPROVAL
MAX_UPSELL_PERCENT_OF_CART
REFUND_APPROVAL_THRESHOLD
```

---

## 8.15 policy_evaluations

```text
id
agent_action_id
policy_id
decision
reason
input_json
created_at
```

Decision:

```text
ALLOW
BLOCK
REQUIRES_APPROVAL
```

---

## 8.16 approvals

```text
id
agent_action_id
user_id
action_type
action_payload_json
amount
currency
reason
status
expires_at
created_at
resolved_at
```

Statuses:

```text
PENDING
APPROVED
REJECTED
EXPIRED
```

---

## 8.17 audit_events

```text
id
merchant_id
user_id
session_id
entity_type
entity_id

actor_type
event_type

message
metadata_json

created_at
```

Actor types:

```text
USER
AGENT
SYSTEM
MERCHANT
RAZORPAY
```

---

## 8.18 recommendation_events

Used for revenue attribution.

```text
id
user_id
cart_id
source_product_id
recommended_product_id
recommendation_type
reason
shown_at
accepted_at
rejected_at
incremental_revenue
```

---

# 9. Agent Architecture

Use **one main Commerce Agent** for the MVP.

Do not start with multiple specialized agents unless required later.

```text
                     ┌─────────────────┐
                     │ Commerce Agent  │
                     └────────┬────────┘
                              │
                    chooses typed tools
                              │
          ┌───────────────────┼──────────────────┐
          ▼                   ▼                  ▼
   Catalog Tools         Cart Tools      Recommendation Tools

          ┌───────────────────┼──────────────────┐
          ▼                   ▼                  ▼
    Checkout Tools        Order Tools       Context Tools
```

The Commerce Agent is responsible for:

- intent understanding,
- deciding which tool to call,
- selecting relevant products,
- conversational explanation,
- respecting known user constraints,
- asking clarifying questions only when truly needed,
- explaining why a recommendation or action is proposed.

It is **not** responsible for authoritative financial calculation.

---

# 10. Agent Tool Registry

Every tool should have:

- a narrow purpose,
- strict input schema,
- validated output,
- server-side authorization,
- logging,
- policy evaluation where relevant.

Example registry:

```ts
const tools = {
  searchCatalog,
  getProduct,
  getCart,
  addToCart,
  removeFromCart,
  getRecommendations,
  requestCheckout,
  getOrderStatus
};
```

---

# 10.1 searchCatalog

Purpose:

Search the structured product catalog.

Input:

```ts
{
  query?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  attributes?: Record<string, unknown>;
  limit?: number;
}
```

Output:

```ts
{
  products: ProductSearchResult[];
}
```

The database query owns filtering.

The LLM should not invent products.

---

# 10.2 getProduct

```ts
{
  productId: string;
}
```

Returns trusted product details.

---

# 10.3 getCart

Returns authoritative cart state.

---

# 10.4 addToCart

```ts
{
  productId: string;
  quantity: number;
}
```

Server validates:

- product exists,
- product active,
- requested quantity valid,
- inventory available.

---

# 10.5 removeFromCart

```ts
{
  cartItemId: string;
}
```

---

# 10.6 getRecommendations

Input:

```ts
{
  cartId: string;
  type?: "CROSS_SELL" | "UPSELL";
}
```

Output:

```ts
{
  recommendations: [
    {
      productId,
      reason,
      expectedCartImpact
    }
  ]
}
```

---

# 10.7 requestCheckout

This must **not directly create a payment**.

Input:

```ts
{
  cartId: string;
}
```

Flow:

```text
requestCheckout
     ↓
Cart revalidation
     ↓
Pricing recalculation
     ↓
Inventory validation
     ↓
Policy evaluation
     ↓
Approval creation if required
     ↓
Checkout proposal returned
```

---

# 10.8 getOrderStatus

```ts
{
  orderId: string;
}
```

---

# 11. Structured Agent State

A useful session state:

```ts
type CommerceSession = {
  conversationId: string;
  userId: string;
  merchantId: string;

  constraints: {
    budget?: number;
    categories?: string[];
    preferences?: Record<string, unknown>;
  };

  activeCartId?: string;

  pendingApprovalId?: string;
};
```

This avoids relying only on raw chat history.

---

# 12. Agent System Prompt Responsibilities

The agent prompt should explicitly instruct the model:

```text
- Never invent products, prices, inventory, discounts, order IDs or payment status.
- Use tools to retrieve authoritative information.
- Never claim payment succeeded until backend verification succeeds.
- Never initiate payment without required approval.
- Respect user budget and merchant constraints.
- Explain recommendations briefly.
- If a tool returns an error, explain the failure and safe next step.
- Treat tool output as authoritative.
```

---

# 13. Recommendation Architecture

The revenue-growth portion should not depend entirely on the LLM.

Use two layers.

```text
Recommendation Candidate Generator
                ↓
         Agent Reasoning
                ↓
        User Recommendation
```

---

## 13.1 Candidate Generator

For MVP, use deterministic rules.

Examples:

```text
Laptop
 → Mouse
 → Laptop sleeve
 → USB-C hub

Coffee machine
 → Coffee beans
 → Milk frother
```

The service can rank candidates by:

```text
manual relation score
category compatibility
stock availability
budget compatibility
cart value impact
```

---

## 13.2 Agent Recommendation Layer

The agent decides how to present the recommendation.

Example:

```text
Current cart: ₹4,499
User budget: ₹5,000
Cross-sell candidate: ₹399
New total: ₹4,898

Result:
Recommendation allowed.
```

If:

```text
New total: ₹5,299
```

and the user clearly specified a ₹5,000 hard budget:

```text
Do not recommend it.
```

---

# 14. Policy Engine Architecture

The Policy Engine evaluates sensitive actions.

```text
Agent Action
    ↓
PolicyEngine.evaluate()
    ↓
┌──────────────┬────────────────────┬─────────────┐
│    ALLOW     │ REQUIRES_APPROVAL  │    BLOCK    │
└──────────────┴────────────────────┴─────────────┘
```

Example interface:

```ts
type PolicyDecision =
  | {
      decision: "ALLOW";
      reasons: string[];
    }
  | {
      decision: "REQUIRES_APPROVAL";
      reasons: string[];
      approvalType: string;
    }
  | {
      decision: "BLOCK";
      reasons: string[];
    };
```

---

# 15. Example Policies

## Payment Approval

```text
Every payment must require explicit customer approval.
```

## Maximum Transaction Amount

```text
MAX_TRANSACTION_AMOUNT = ₹10,000
```

If amount:

```text
₹12,500
```

Result:

```text
BLOCK
```

## Maximum Discount

```text
AUTO_DISCOUNT <= 10%
MERCHANT_APPROVED_DISCOUNT <= 20%
```

## Upsell Limit

Example:

```text
MAX_UPSELL_PERCENT_OF_CART = 25%
```

If cart is ₹4,000:

```text
maximum recommended incremental spend = ₹1,000
```

## Final Proposal Price

For the MVP, prices do not change after checkout preparation. The amount stored in the approved checkout proposal is the final amount used to create the order and payment attempt.

## Refund

```text
refund <= ₹500
    → automatic or merchant-configurable

refund > ₹500
    → merchant approval required
```

---

# 16. Approval Architecture

Sensitive operations produce Approval objects.

```text
Agent proposes checkout
         ↓
Policy says approval required
         ↓
Approval created
         ↓
User sees authoritative summary
         ↓
Approve / Reject
         ↓
Approved action executed
```

Example user-facing approval:

```text
Payment approval

Merchant: Demo Store

Items:
SoundMax Pro     ₹4,499
USB-C Cable        ₹299

Subtotal          ₹4,798
Discount              ₹0
Shipping               ₹0

Total             ₹4,798

Reason:
You asked the assistant to buy the selected cart.

[Approve payment] [Cancel]
```

---

# 17. Checkout Architecture

```text
User requests checkout
        ↓
CheckoutService.prepareCheckout(cartId)
        ↓
Read latest database state
        ↓
Check active products
        ↓
Check inventory
        ↓
Recalculate prices
        ↓
Recalculate discount
        ↓
Calculate final total
        ↓
Compare against user/merchant policies
        ↓
Generate checkout proposal
        ↓
Request user approval
```

The checkout proposal should contain:

```ts
{
  cartId,
  items,
  subtotal,
  discount,
  shipping,
  tax,
  total,
  currency,
  priceChanges,
  stockWarnings
}
```

---

# 18. Payment Architecture

The PaymentService should expose a provider-independent interface.

```ts
interface PaymentProvider {
  createOrder(input: CreatePaymentOrderInput): Promise<PaymentOrder>;
  verifyPayment(input: VerifyPaymentInput): Promise<VerificationResult>;
}
```

Implementation:

```ts
class RazorpayPaymentProvider implements PaymentProvider {
  // Razorpay-specific implementation
}
```

---

# 19. Payment Sequence

```text
Customer
   │
   │ approve payment
   ▼
ApprovalService
   │
   │ validates approval
   ▼
CheckoutService
   │
   │ revalidates cart again
   ▼
OrderService
   │
   │ creates internal PENDING order
   ▼
PaymentService
   │
   │ creates Razorpay order
   ▼
Razorpay API
   │
   │ provider_order_id
   ▼
Frontend
   │
   │ opens Razorpay Checkout
   ▼
Razorpay
   │
   │ payment response
   ▼
Backend Verification
   │
   ├── verify signature
   ├── update payment
   ├── update order
   └── audit result
```

---

# 20. Internal Order Before External Payment

Create an internal order before opening Razorpay checkout.

Example:

```text
order_internal_123
status = PAYMENT_PENDING
```

Then associate:

```text
provider_order_id = order_RazorpayXYZ
```

This gives your system a durable transaction identity even if:

- browser closes,
- payment fails,
- webhook is delayed,
- user retries.

---

# 21. Idempotency

Payment-sensitive endpoints must be retry-safe.

Example:

```text
POST /api/checkout/confirm
```

should accept an idempotency key:

```text
Idempotency-Key: approval_123
```

If the request is repeated, it must not create:

```text
2 internal orders
2 Razorpay orders
2 payment attempts
```

Possible database uniqueness constraint:

```text
UNIQUE(approval_id)
```

---

# 22. Razorpay Webhooks

Use a webhook endpoint:

```text
POST /api/webhooks/razorpay
```

Responsibilities:

1. Verify webhook signature.
2. Parse supported event.
3. Locate payment/order.
4. Apply idempotent state transition.
5. Write audit event.
6. Return success quickly.

Webhook handling should not blindly trust frontend payment results.

---

# 23. Payment State Machine

```text
CREATED
   ↓
PENDING
   ↓
AUTHORIZED
   ↓
CAPTURED
```

Failure path:

```text
PENDING
   ↓
FAILED
```

Possible refund:

```text
CAPTURED
   ↓
REFUNDED
```

The UI and agent should read this state rather than infer payment success.

---

# 24. Order State Machine

```text
PENDING
   ↓
PAYMENT_PENDING
   ├──────────────→ PAYMENT_FAILED
   │
   ↓
PAID
   ↓
FULFILLED
```

Cancellation:

```text
PENDING
PAYMENT_PENDING
      ↓
CANCELLED
```

---

# 25. Audit Trail Architecture

Every important event should create an immutable audit event.

```text
AuditService.record({
  actorType,
  eventType,
  entityType,
  entityId,
  message,
  metadata
})
```

Recommended audit events:

```text
USER_MESSAGE_RECEIVED
AGENT_TOOL_REQUESTED
TOOL_EXECUTED
TOOL_FAILED
RECOMMENDATION_SHOWN
RECOMMENDATION_ACCEPTED
CART_UPDATED
CHECKOUT_REQUESTED
POLICY_EVALUATED
ACTION_BLOCKED
APPROVAL_CREATED
APPROVAL_APPROVED
APPROVAL_REJECTED
ORDER_CREATED
RAZORPAY_ORDER_CREATED
PAYMENT_INITIATED
PAYMENT_VERIFIED
PAYMENT_FAILED
ORDER_PAID
WEBHOOK_RECEIVED
```

---

# 26. Example Audit Timeline

```text
10:31:05
USER_MESSAGE_RECEIVED
"Find wireless headphones below ₹5,000."

10:31:06
AGENT_TOOL_REQUESTED
searchCatalog({
  category: "headphones",
  maxPrice: 5000
})

10:31:06
TOOL_EXECUTED
3 products returned.

10:31:09
RECOMMENDATION_SHOWN
SoundMax Pro
Reason:
- ₹4,499
- Wireless
- 40-hour battery

10:31:35
AGENT_TOOL_REQUESTED
addToCart({
  productId: "prod_123"
})

10:31:35
CART_UPDATED
Cart total: ₹4,499

10:31:37
RECOMMENDATION_SHOWN
Protective case: ₹299
Projected total: ₹4,798

10:31:51
RECOMMENDATION_ACCEPTED

10:32:10
CHECKOUT_REQUESTED

10:32:10
POLICY_EVALUATED
Decision: REQUIRES_APPROVAL
Reason: payment requires explicit user approval.

10:32:15
APPROVAL_APPROVED

10:32:16
ORDER_CREATED
Internal order: ord_123

10:32:17
RAZORPAY_ORDER_CREATED
Provider order: order_xyz

10:32:41
PAYMENT_VERIFIED

10:32:42
ORDER_PAID
Final amount: ₹4,798
```

---

# 27. Failure Handling

At least one failure should be deliberately demonstrated.

Recommended failure scenarios:

1. item went out of stock,
2. payment failed,
3. spending limit exceeded,
4. duplicate checkout attempt,
5. webhook delivered twice.

---

# 28. Best Demo Failure: Out of Stock

Sequence:

```text
Agent recommends a product with one unit in stock
        ↓
User adds to cart
        ↓
Another customer buys the final unit
        ↓
User asks to checkout
        ↓
CheckoutService validates current inventory
        ↓
Out-of-stock condition detected
        ↓
Payment NOT created
        ↓
User informed
```

User-facing response:

```text
SoundMax Pro is no longer in stock.

No payment has been initiated.

Please remove it from your cart or choose another product.
```

This demonstrates:

- inventory validation,
- bounded money actions,
- user approval,
- explainability,
- safe failure handling.

---

# 29. Spending-Limit Failure

Policy:

```text
MAX_TRANSACTION_AMOUNT = ₹5,000
```

Cart:

```text
₹5,300
```

Policy result:

```text
BLOCK
```

Audit event:

```text
ACTION_BLOCKED

Requested:
CREATE_PAYMENT ₹5,300

Policy:
MAX_TRANSACTION_AMOUNT ₹5,000

Reason:
Requested transaction exceeds merchant-configured limit.

Money moved:
₹0
```

---

# 30. Payment Failure

If Razorpay returns failure:

```text
Payment failed.

Order status:
PAYMENT_FAILED

Money captured:
₹0

Cart:
Preserved

Next action:
Retry payment
```

The agent must never say:

```text
"Your order is confirmed"
```

until payment verification says so.

---

# 31. API Design

Recommended API structure:

```text
/api
├── /products
├── /products/[id]
├── /cart
├── /cart/items
├── /orders
├── /orders/[id]
├── /agent
├── /checkout
├── /approvals
├── /payments
├── /webhooks/razorpay
└── /admin
```

---

# 31.1 Product APIs

```text
GET /api/products
GET /api/products/:id
POST /api/admin/products
PATCH /api/admin/products/:id
```

---

# 31.2 Cart APIs

```text
GET /api/cart
POST /api/cart/items
PATCH /api/cart/items/:id
DELETE /api/cart/items/:id
```

---

# 31.3 Agent API

```text
POST /api/agent/message
```

Request:

```json
{
  "conversationId": "conv_123",
  "message": "Find wireless headphones under ₹5000"
}
```

Response may be streamed.

---

# 31.4 Checkout API

```text
POST /api/checkout/prepare
```

Produces authoritative checkout proposal.

```text
POST /api/checkout/confirm
```

Requires valid approval.

---

# 31.5 Approval APIs

```text
GET  /api/approvals/:id
POST /api/approvals/:id/approve
POST /api/approvals/:id/reject
```

---

# 31.6 Payment APIs

```text
POST /api/payments/create
POST /api/payments/verify
```

Keep these server-side and tightly authorized.

---

# 31.7 Webhook

```text
POST /api/webhooks/razorpay
```

---

# 32. Service Layer

Recommended folder-level services:

```text
ProductService
InventoryService
CartService
PricingService
RecommendationService
PolicyService
ApprovalService
CheckoutService
OrderService
PaymentService
AuditService
AgentService
```

---

# 33. Responsibilities by Service

## ProductService

- get products,
- search/filter products,
- product metadata,
- product activation.

## InventoryService

- current stock,
- stock availability,
- quantity validation.

## CartService

- create cart,
- add/remove item,
- fetch cart.

## PricingService

Authoritative calculation for:

```text
subtotal
discount
shipping
tax
total
```

## RecommendationService

- cross-sell candidates,
- upsell candidates,
- recommendation scoring,
- revenue attribution.

## PolicyService

- load policies,
- evaluate proposed action,
- return ALLOW/BLOCK/REQUIRES_APPROVAL.

## ApprovalService

- create approval,
- approve,
- reject,
- expire,
- verify approval validity.

## CheckoutService

Coordinates:

```text
cart
inventory
pricing
policy
approval
order
payment
```

## OrderService

- create order,
- state transitions,
- order snapshots.

## PaymentService

- Razorpay order creation,
- payment verification,
- provider state mapping.

## AuditService

- immutable audit records.

## AgentService

- conversation context,
- tool invocation orchestration,
- LLM interaction.

---

# 34. Suggested Codebase Structure

For Next.js:

```text
src/
├── app/
│   ├── (store)/
│   │   ├── shop/
│   │   ├── assistant/
│   │   ├── cart/
│   │   ├── checkout/
│   │   └── orders/
│   │
│   ├── admin/
│   │   ├── dashboard/
│   │   ├── products/
│   │   ├── orders/
│   │   ├── policies/
│   │   ├── approvals/
│   │   ├── audit/
│   │   └── analytics/
│   │
│   └── api/
│       ├── agent/
│       ├── products/
│       ├── cart/
│       ├── checkout/
│       ├── approvals/
│       ├── payments/
│       └── webhooks/
│
├── modules/
│   ├── agent/
│   │   ├── agent.service.ts
│   │   ├── prompts.ts
│   │   ├── tools/
│   │   │   ├── search-catalog.tool.ts
│   │   │   ├── get-product.tool.ts
│   │   │   ├── get-cart.tool.ts
│   │   │   ├── add-to-cart.tool.ts
│   │   │   ├── recommend.tool.ts
│   │   │   └── request-checkout.tool.ts
│   │   └── types.ts
│   │
│   ├── catalog/
│   ├── cart/
│   ├── inventory/
│   ├── pricing/
│   ├── recommendations/
│   ├── policy/
│   ├── approvals/
│   ├── checkout/
│   ├── orders/
│   ├── payments/
│   └── audit/
│
├── integrations/
│   ├── razorpay/
│   │   ├── razorpay.client.ts
│   │   ├── razorpay.provider.ts
│   │   ├── razorpay.webhook.ts
│   │   └── razorpay.types.ts
│   └── llm/
│       ├── llm.provider.ts
│       └── providers/
│
├── db/
│   ├── schema/
│   ├── migrations/
│   └── client.ts
│
├── lib/
│   ├── auth/
│   ├── validation/
│   ├── errors/
│   └── logging/
│
└── shared/
    ├── types/
    └── constants/
```

---

# 35. Security Architecture

Even in test mode, implement realistic safety controls.

---

## 35.1 Server-Side Secrets

Never expose:

```text
Razorpay secret key
Webhook secret
Database credentials
LLM secret keys
```

to the browser.

---

## 35.2 Input Validation

Use Zod or equivalent for every mutation endpoint and every agent tool.

Example:

```ts
const AddToCartSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive().max(10)
});
```

---

## 35.3 Authorization

Customer:

```text
can manage own cart
can view own orders
can approve own payment
```

Merchant admin:

```text
can manage products
can configure policies
can inspect merchant audit logs
```

---

## 35.4 Never Trust LLM Tool Arguments

Tool argument:

```text
price: 100
```

must not be accepted for financial calculation.

Instead:

```text
productId
quantity
```

and the backend loads the current price.

---

## 35.5 Webhook Verification

Reject unsigned or invalid webhook requests.

---

## 35.6 Sensitive Data

Do not send unnecessary payment information to the LLM.

The agent only needs high-level state:

```text
payment status = failed
order amount = ₹4,798
```

not sensitive provider payloads.

---

# 36. Concurrency and Race Conditions

Important scenario:

```text
Stock = 1

Customer A checks out
Customer B checks out
```

Both cannot successfully purchase the same final unit.

For the assignment, at minimum:

- recheck inventory before payment creation,
- use database transaction where appropriate,
- prevent negative stock.

Optional advanced design:

```text
temporary inventory reservation
```

with expiry.

---

# 37. Transaction Boundaries

Useful database transaction examples:

## Order Creation

```text
BEGIN

create internal order
copy cart items to order items
set cart CHECKOUT_PENDING

COMMIT
```

## Payment Success Handling

```text
BEGIN

mark payment CAPTURED
decrement product inventory
mark order PAID
mark cart CONVERTED
write audit event

COMMIT
```

---

# 38. Error Model

Create typed application errors.

Examples:

```text
PRODUCT_NOT_FOUND
OUT_OF_STOCK
POLICY_BLOCKED
APPROVAL_REQUIRED
APPROVAL_EXPIRED
PAYMENT_CREATION_FAILED
PAYMENT_VERIFICATION_FAILED
INVALID_WEBHOOK_SIGNATURE
ORDER_ALREADY_PAID
```

API response:

```json
{
  "error": {
    "code": "OUT_OF_STOCK",
    "message": "One or more products are no longer in stock.",
    "details": {
      "productId": "prod_123"
    }
  }
}
```

The agent can then explain it gracefully.

---

# 39. Observability

For an assignment, basic structured logging is enough.

Log:

```text
request_id
user_id
conversation_id
cart_id
order_id
payment_id
agent_action_id
```

This makes debugging the entire flow much easier.

---

# 40. Analytics Architecture

To prove merchant growth, track:

```text
recommendations shown
recommendations accepted
recommendations rejected
incremental cart value
agent-assisted conversion
average order value
cross-sell revenue
upsell revenue
```

Example:

```text
Recommendation shown:
USB-C Hub ₹799

Accepted:
true

Cart before:
₹4,499

Cart after:
₹5,298

Incremental revenue:
₹799
```

---

# 41. Key Product Metrics

Merchant dashboard can display:

```text
Agent-assisted revenue
Average order value
Recommendation acceptance rate
Incremental recommendation revenue
Checkout conversion rate
Payment success rate
Blocked unsafe actions
Approval acceptance rate
```

---

# 42. Example End-to-End Happy Path

User:

```text
I need wireless headphones under ₹5,000.
```

System:

```text
1. Agent receives intent.

2. Agent calls:
   searchCatalog({
     query: "wireless headphones",
     maxPrice: 5000
   })

3. Catalog service returns 3 products.

4. Agent recommends SoundMax Pro at ₹4,499.

5. User:
   "Add that."

6. Agent calls:
   addToCart({
     productId: "prod_soundmax",
     quantity: 1
   })

7. Cart service returns authoritative cart:
   ₹4,499

8. Recommendation service returns:
   Protective Case ₹299

9. Agent:
   "You can add a protective case for ₹299.
    Your total would become ₹4,798."

10. User accepts.

11. Cart total:
    ₹4,798

12. User:
    "Buy it."

13. Agent calls:
    requestCheckout({
      cartId: "cart_123"
    })

14. Checkout service:
    - checks inventory
    - checks current prices
    - calculates total
    - evaluates policies

15. Policy:
    payment requires explicit approval.

16. Approval UI shown:
    Total ₹4,798.

17. User approves.

18. Backend creates internal order.

19. PaymentService creates Razorpay test order.

20. Razorpay Checkout opens.

21. Test payment succeeds.

22. Backend verifies payment.

23. Order → PAID.

24. Cart → CONVERTED.

25. Audit trail records every step.

26. Merchant analytics attributes:
    ₹299 incremental revenue to cross-sell.
```

---

# 43. End-to-End Failure Path

Suppose the cart total exceeds the merchant's configured transaction limit.

Flow:

```text
User requests checkout
        ↓
CheckoutService prepares the final proposal
        ↓
Policy engine evaluates the total
        ↓
POLICY_BLOCKED
        ↓
No approval is created
        ↓
Payment not created
        ↓
User receives the policy explanation
        ↓
Audit event written
```

Result:

```text
No money action occurred outside merchant policy.
```

This directly satisfies the assignment bar.

---

# 44. State Ownership

A useful rule:

| State | Owner |
|---|---|
| User intent | Agent/conversation |
| Product price | Product/Pricing service |
| Inventory | Inventory service |
| Cart | Cart service |
| Discounts | Pricing/Policy service |
| Approval | Approval service |
| Order | Order service |
| Payment | Payment/Razorpay service |
| Audit history | Audit service |

The LLM owns none of the authoritative business state.

---

# 45. What Should Be Real vs Mocked

For an assignment, prioritize depth over unnecessary breadth.

## Build for real

```text
Product database
Agent tool calling
Cart state
Recommendation flow
Policy engine
Approval flow
Order state
Razorpay test order
Test checkout
Payment verification
Audit trail
Failure demonstration
```

## Can be simplified or mocked

```text
Shipping carrier integration
Real tax engine
Real fulfillment
Email delivery
CRM
Actual inventory warehouse system
Real recommendation ML model
Marketing campaign provider
```

---

# 46. Recommended MVP Scope

The MVP should demonstrate exactly these capabilities:

```text
1. Merchant product catalog
2. Agent-readable structured product data
3. Conversational product discovery
4. Product recommendation with reason
5. Cart manipulation through agent tools
6. Cross-sell or upsell
7. User budget awareness
8. Policy evaluation
9. Explicit payment approval
10. Razorpay test-mode checkout
11. Payment verification
12. Order creation
13. Audit dashboard
14. Revenue attribution
15. One deliberate failure scenario
```

Anything beyond this is optional.

---

# 47. Optional Phase 2 Features

After the MVP works:

## Customer Memory

Remember:

```text
preferred categories
size
budget range
favorite brands
```

## Campaign Orchestrator

Merchant prompt:

```text
Create a campaign for users who abandoned carts containing headphones.
Maximum discount 10%.
```

The system can generate a proposed campaign but require merchant approval.

## MCP / Protocol Exposure

Expose merchant catalog and commerce tools through an agent protocol.

## External Buyer Agent

Create a separate buyer agent that consumes merchant commerce APIs.

## Dynamic Product Bundles

Use historical acceptance data to improve bundles.

## Merchant Revenue Agent

Analyzes:

```text
low-converting products
abandoned carts
low inventory
high-margin accessories
```

and proposes growth actions.

---

# 48. Protocol-Friendly Design

Although you do not need to fully implement ACP/AP2/x402 for the assignment, design interfaces so they could later be exposed externally.

For example:

```text
CatalogCapability
CartCapability
CheckoutCapability
PaymentAuthorizationCapability
OrderCapability
```

This keeps agent tools aligned with future agent-to-agent commerce interfaces.

---

# 49. Testing Strategy

## Unit Tests

Test:

```text
PricingService
PolicyEngine
RecommendationService
ApprovalService
state transitions
```

## Integration Tests

Test:

```text
cart → checkout
checkout → approval
approval → order
order → Razorpay test order
payment verification
webhook processing
```

## Agent Tests

Use fixed scenarios:

```text
"Find headphones under ₹5,000."

"Add the first one."

"Buy it."

"Spend at most ₹3,000."

"Ignore the budget and buy the ₹8,000 product."
```

The final request should be blocked.

---

# 50. Security Tests

Test:

```text
tampered amount
tampered product price
expired approval
reused approval
duplicate payment request
invalid webhook signature
unauthorized order access
```

---

# 51. Demo Script

A strong demo can be performed in approximately one continuous scenario.

## Part 1 — Product Discovery

User:

```text
I need wireless headphones under ₹5,000 with long battery life.
```

Show:

- agent search,
- recommendation,
- explanation.

## Part 2 — Revenue Growth

User selects one.

Agent recommends:

```text
Protective case ₹299
```

User accepts.

Show AOV increase.

## Part 3 — Safe Checkout

User:

```text
Buy it.
```

Show:

- cart revalidation,
- policy check,
- approval gate.

## Part 4 — Razorpay

Approve and complete test payment.

Show order success.

## Part 5 — Audit

Open `/admin/audit`.

Show:

```text
user request
tool calls
recommendation
cart changes
policy result
approval
Razorpay order
verified payment
```

## Part 6 — Failure

Change a product price or enforce a lower spending limit.

Attempt another checkout.

Show:

```text
BLOCKED / REQUIRES_APPROVAL
```

and:

```text
Money moved: ₹0
```

---

# 52. Architecture Decision Records

Useful decisions to explain to evaluators:

## ADR-001 — LLM Cannot Move Money Directly

Reason:

LLMs are probabilistic and unsuitable as financial authority.

Decision:

All financial actions require deterministic backend services and policies.

## ADR-002 — Single Commerce Agent for MVP

Reason:

Multi-agent orchestration creates unnecessary complexity.

Decision:

One agent with narrowly scoped typed tools.

## ADR-003 — Shared Business Service Layer

Reason:

The human storefront and AI agent should obey identical commerce rules.

Decision:

Both call the same domain services.

## ADR-004 — Payment Requires Explicit Approval

Reason:

Payment is a high-impact action.

Decision:

No payment order is initiated until approval exists.

## ADR-005 — Revalidate Before Payment

Reason:

Cart data may become stale.

Decision:

Inventory and pricing are revalidated immediately before payment creation.

## ADR-006 — Immutable Audit Trail

Reason:

The assignment requires explainability.

Decision:

Every important action generates an append-only audit event.

---

# 53. Sequence Diagram — Agent Product Search

```text
User
 │
 │ "Find headphones under ₹5,000"
 ▼
Frontend
 │
 ▼
Agent API
 │
 ▼
Commerce Agent
 │
 │ tool call
 ▼
searchCatalog
 │
 ▼
ProductService
 │
 ▼
PostgreSQL
 │
 │ matching products
 ▼
Commerce Agent
 │
 │ explanation
 ▼
Frontend
 │
 ▼
User
```

---

# 54. Sequence Diagram — Checkout

```text
User
 │
 │ "Buy it"
 ▼
Agent
 │
 │ requestCheckout(cartId)
 ▼
CheckoutService
 │
 ├── CartService
 │
 ├── InventoryService
 │
 ├── PricingService
 │
 └── PolicyService
 │
 ▼
ApprovalService
 │
 │ PENDING
 ▼
Frontend
 │
 │ Approve
 ▼
ApprovalService
 │
 │ APPROVED
 ▼
OrderService
 │
 ▼
PaymentService
 │
 ▼
Razorpay Test API
```

---

# 55. Sequence Diagram — Payment Verification

```text
Razorpay Checkout
      │
      │ payment result
      ▼
Frontend
      │
      ▼
Payment Verify API
      │
      ├── verify signature
      │
      ▼
PaymentService
      │
      ▼
OrderService
      │
      ▼
AuditService
      │
      ▼
Frontend
```

Webhook provides an additional asynchronous verification path.

---

# 56. Sequence Diagram — Policy Block

```text
Agent
 │
 │ CREATE_PAYMENT ₹7,500
 ▼
PolicyEngine
 │
 │ MAX_TRANSACTION = ₹5,000
 ▼
BLOCK
 │
 ├── no Razorpay call
 ├── audit event
 └── explanation
```

---

# 57. Build Order

Implement the project in this order.

## Phase 1 — Commerce Foundation

```text
Database
Products
Cart
Pricing
Orders
```

Do not add AI yet.

## Phase 2 — Razorpay

```text
Internal order
Razorpay test order
Checkout
Verification
Webhook
```

Ensure normal checkout works before agent integration.

## Phase 3 — Agent

Add:

```text
chat
searchCatalog
getProduct
addToCart
getCart
requestCheckout
```

## Phase 4 — Safety

Add:

```text
policies
approvals
revalidation
audit events
```

## Phase 5 — Revenue

Add:

```text
cross-sell
upsell
recommendation events
analytics
```

## Phase 6 — Failure Demo

Add one deliberate scenario:

```text
spending limit
```

## Phase 7 — Polish

Build:

```text
merchant dashboard
audit viewer
analytics cards
demo seed data
```

---

# 58. Suggested Seed Merchant

To make the demo easy, use one focused merchant category.

Good choices:

```text
Electronics accessories
Coffee equipment
Skincare
Fitness accessories
Gaming accessories
```

Electronics is especially easy because cross-sells are intuitive.

Example catalog:

```text
Wireless headphones
Gaming headset
Bluetooth speaker
Mechanical keyboard
Gaming mouse
USB-C hub
Laptop stand
Protective case
Charging cable
Power bank
```

---

# 59. Suggested Demo Policies

Seed these policies:

```text
MAX_TRANSACTION_AMOUNT = ₹6,000

MAX_AUTO_DISCOUNT_PERCENT = 10

MAX_TOTAL_DISCOUNT_PERCENT = 20

REQUIRE_PAYMENT_APPROVAL = true

MAX_UPSELL_PERCENT_OF_CART = 25

REVALIDATE_INVENTORY_BEFORE_PAYMENT = true
```

---

# 60. Definition of Done

The project is complete when the following flow works:

```text
User
 ↓
Natural-language product request
 ↓
Agent searches structured catalog
 ↓
Agent explains recommendation
 ↓
User selects product
 ↓
Agent modifies authoritative cart
 ↓
Agent presents relevant cross-sell
 ↓
User accepts/rejects
 ↓
Checkout requested
 ↓
Backend validates inventory and uses the proposal's final prices
 ↓
Policy engine evaluates
 ↓
Explicit approval
 ↓
Internal order created
 ↓
Razorpay test order created
 ↓
Test checkout
 ↓
Payment verified
 ↓
Order marked paid
 ↓
Audit trail visible
 ↓
Merchant analytics show recommendation impact
```

And at least one negative path works:

```text
Unsafe/stale action
 ↓
Policy or validation failure
 ↓
Payment not initiated
 ↓
User receives clear explanation
 ↓
Audit event records the failure
```

---

# 61. Final Architecture Summary

The most important design is:

```text
                     CUSTOMER / AI BUYER
                              │
                              ▼
                       Commerce Agent
                              │
                        typed tool calls
                              │
                              ▼
                    Trusted Commerce Layer
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
           Catalog           Cart      Recommendations
                              │
                              ▼
                         Policy Engine
                              │
                  ┌───────────┼───────────┐
                  ▼           ▼           ▼
                ALLOW      APPROVAL      BLOCK
                  │           │
                  └──────┬────┘
                         ▼
                    Checkout Service
                         │
                         ▼
                     Order Service
                         │
                         ▼
                    Payment Service
                         │
                         ▼
                  Razorpay Test Mode
                         │
                         ▼
                  Payment Verification
                         │
                         ▼
                     Paid Order

Every meaningful step
          │
          └────────────────────────────→ Audit Service

Accepted recommendations
          │
          └────────────────────────────→ Revenue Analytics
```

The system therefore demonstrates all four properties Razorpay is asking for:

```text
Revenue growth
      +
AI-buyable merchant
      +
Safe bounded money actions
      +
Explainable audit trail
```

The core product is not simply an AI chatbot with a payment button.

It is a **policy-controlled agentic commerce system where AI can reason about commerce, but deterministic software remains authoritative over products, pricing, approvals, orders, and money movement.**
