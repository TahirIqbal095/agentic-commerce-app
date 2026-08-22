# Commerce HTTP Contracts

This document defines the first customer-facing HTTP contracts and the domain-module seams behind them. It intentionally excludes the conversational agent: the agent will later call the same commerce modules as these routes.

## Contract conventions

- All IDs are opaque UUID strings.
- All money values are integer minor units. For INR, `449900` means ₹4,499.00.
- Currency values are ISO 4217 uppercase codes such as `INR`.
- The authenticated customer and merchant context are resolved on the server. A caller cannot select another `userId` or `merchantId` in a mutation payload.
- Expected failures are returned as typed error values. Unexpected failures are not exposed to clients.
- Mutation route handlers are thin adapters over domain modules. They validate transport input, resolve identity, call one module interface, and map its result to HTTP.
- The server never accepts a client-provided product price, cart total, order amount, policy result, approval status, or payment status as authoritative.

Successful responses use:

```json
{
  "data": {}
}
```

Expected errors use:

```json
{
  "error": {
    "code": "POLICY_BLOCKED",
    "message": "The requested checkout is blocked by merchant policy.",
    "details": {}
  }
}
```

## Domain-module interfaces

The initial module seams are intentionally small:

```ts
interface CatalogModule {
  search(input: CatalogSearch): Promise<CatalogSearchResult>;
  getProduct(productId: string): Promise<ProductDetailResult>;
}

interface CartModule {
  getActiveCart(customer: CustomerContext): Promise<CartResult>;
  addItem(customer: CustomerContext, input: AddCartItem): Promise<CartResult>;
  changeItem(customer: CustomerContext, input: ChangeCartItem): Promise<CartResult>;
  removeItem(customer: CustomerContext, cartItemId: string): Promise<CartResult>;
}

interface CheckoutModule {
  prepare(customer: CustomerContext): Promise<CheckoutPreparationResult>;
  resolveApproval(customer: CustomerContext, input: ResolveApproval): Promise<ApprovalResult>;
  confirm(customer: CustomerContext, input: ConfirmCheckout): Promise<CheckoutConfirmationResult>;
}

interface OrderModule {
  get(customer: CustomerContext, orderId: string): Promise<OrderResult>;
  verifyPayment(customer: CustomerContext, input: VerifyPayment): Promise<PaymentVerificationResult>;
}
```

`CheckoutModule` hides cart revalidation, price calculation, inventory checks, policy evaluation, approval creation, order snapshots, and payment-attempt idempotency. Callers do not orchestrate those steps.

## Catalog

### `GET /api/products`

Searches only active products belonging to the current merchant.

Query parameters:

```ts
type ProductSearchQuery = {
  query?: string;
  category?: string;
  minPriceMinor?: number;
  maxPriceMinor?: number;
  attributes?: string; // URL-encoded JSON object
  cursor?: string;
  limit?: number; // default 20, maximum 50
};
```

Response:

```ts
type ProductSearchResponse = {
  products: Array<{
    id: string;
    slug: string;
    name: string;
    description: string;
    category: string;
    priceMinor: number;
    currency: string;
    inStock: boolean;
    attributes: Record<string, unknown>;
  }>;
  nextCursor?: string;
};
```

Errors: `INVALID_QUERY`.

Audit: catalog reads are not individually audited for the storefront. Agent-originated searches will be recorded as agent actions later.

### `GET /api/products/:productId`

Returns an active product. A product from another merchant is treated as not found.

Errors: `PRODUCT_NOT_FOUND`.

## Cart

### `GET /api/cart`

Returns the authenticated customer's active cart, creating an empty cart if none exists.

Response:

```ts
type CartResponse = {
  id: string;
  version: number;
  status: "ACTIVE" | "CHECKOUT_PENDING";
  currency: string;
  items: Array<{
    id: string;
    productId: string;
    name: string;
    quantity: number;
    unitPriceMinor: number;
    lineTotalMinor: number;
  }>;
  subtotalMinor: number;
  discountMinor: number;
  shippingMinor: number;
  taxMinor: number;
  totalMinor: number;
};
```

The response is calculated from current server data. Final payable prices are fixed when the checkout proposal is prepared.

### `POST /api/cart/items`

Request:

```ts
type AddCartItemRequest = {
  productId: string;
  quantity: number; // integer, 1..10
  expectedCartVersion?: number;
};
```

The module validates merchant ownership, product activity, inventory, and currency. Adding an existing product increases its quantity.

Errors: `PRODUCT_NOT_FOUND`, `OUT_OF_STOCK`, `CART_NOT_ACTIVE`, `CART_VERSION_CONFLICT`, `INVALID_QUANTITY`.

Audit: `CART_ITEM_ADDED` with IDs, quantity, and resulting cart total.

### `PATCH /api/cart/items/:cartItemId`

Request:

```ts
type ChangeCartItemRequest = {
  quantity: number; // integer, 1..10
  expectedCartVersion?: number;
};
```

Errors: `CART_ITEM_NOT_FOUND`, `OUT_OF_STOCK`, `CART_NOT_ACTIVE`, `CART_VERSION_CONFLICT`, `INVALID_QUANTITY`.

Audit: `CART_ITEM_QUANTITY_CHANGED`.

### `DELETE /api/cart/items/:cartItemId`

Optionally accepts `If-Match` containing the cart version.

Errors: `CART_ITEM_NOT_FOUND`, `CART_NOT_ACTIVE`, `CART_VERSION_CONFLICT`.

Audit: `CART_ITEM_REMOVED`.

## Checkout preparation

### `POST /api/checkout/prepare`

No cart ID is accepted. The module resolves the customer's active cart, then:

1. Reads current products.
2. Validates inventory.
3. Calculates authoritative totals.
4. Fixes those prices in an immutable checkout proposal.
5. Evaluates active merchant policies.
6. Persists the proposal and its item snapshots.
7. Creates an approval when the policy decision requires one.

Request:

```ts
type PrepareCheckoutRequest = {
  expectedCartVersion?: number;
};
```

Response:

```ts
type PrepareCheckoutResponse = {
  proposal: {
    id: string;
    cartId: string;
    cartVersion: number;
    items: CheckoutItemSnapshot[];
    subtotalMinor: number;
    discountMinor: number;
    shippingMinor: number;
    taxMinor: number;
    totalMinor: number;
    currency: string;
    stockWarnings: StockWarning[];
    expiresAt: string;
  };
  policy: {
    decision: "ALLOW" | "REQUIRES_APPROVAL" | "BLOCK";
    reasons: string[];
  };
  approval?: {
    id: string;
    status: "PENDING";
    expiresAt: string;
  };
};
```

An empty cart or hard policy block produces no approval. Prices in a prepared proposal are final for that checkout and are not recalculated during confirmation.

Errors: `CART_EMPTY`, `CART_VERSION_CONFLICT`, `OUT_OF_STOCK`, `POLICY_BLOCKED`.

Audit: `CHECKOUT_PREPARED`, `POLICY_EVALUATED`, `APPROVAL_CREATED`, or `ACTION_BLOCKED` as applicable.

## Approval

### `POST /api/approvals/:approvalId/approve`

Approves only an unexpired pending approval owned by the authenticated customer. The approved amount and proposal cannot be changed.

Request:

```ts
type ApproveRequest = {
  proposalId: string;
};
```

Errors: `APPROVAL_NOT_FOUND`, `APPROVAL_EXPIRED`, `APPROVAL_ALREADY_RESOLVED`, `PROPOSAL_MISMATCH`.

Audit: `APPROVAL_APPROVED`.

### `POST /api/approvals/:approvalId/reject`

Rejects a pending approval owned by the authenticated customer. Rejection is idempotent; repeated rejection returns the existing rejected state.

Audit: `APPROVAL_REJECTED`.

## Checkout confirmation

### `POST /api/checkout/confirm`

Requires an `Idempotency-Key` header. For the MVP, the approval ID is the natural key.

Request:

```ts
type ConfirmCheckoutRequest = {
  proposalId: string;
  approvalId: string;
};
```

The module atomically validates the approval and proposal, checks current stock without decrementing it, creates the internal order and immutable order items from the proposal, marks the cart `CHECKOUT_PENDING`, and creates one payment attempt/provider order. Repeating the same key returns the same order and payment attempt.

Response:

```ts
type ConfirmCheckoutResponse = {
  order: {
    id: string;
    status: "PAYMENT_PENDING";
    totalMinor: number;
    currency: string;
  };
  payment: {
    id: string;
    provider: "RAZORPAY";
    providerOrderId: string;
    amountMinor: number;
    currency: string;
    publicKey: string;
  };
};
```

Errors: `IDEMPOTENCY_KEY_REQUIRED`, `APPROVAL_REQUIRED`, `APPROVAL_EXPIRED`, `APPROVAL_ALREADY_USED`, `PROPOSAL_EXPIRED`, `CART_CHANGED`, `OUT_OF_STOCK`, `POLICY_BLOCKED`, `PAYMENT_CREATION_FAILED`.

Audit: `ORDER_CREATED`, `PAYMENT_ATTEMPT_CREATED`, `PROVIDER_ORDER_CREATED`; failure events are recorded without claiming money moved.

There is no public `POST /api/payments/create` route. Payment creation is an internal step of checkout confirmation so callers cannot bypass approval or revalidation.

## Payment verification and webhooks

### `POST /api/payments/verify`

Request:

```ts
type VerifyPaymentRequest = {
  paymentAttemptId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
};
```

The module loads the expected provider order and amount, verifies the signature server-side, and applies an idempotent state transition. After payment is verified, the same database transaction decrements product stock, marks the order paid, and converts the cart. It never accepts an amount or success flag from the browser.

Errors: `PAYMENT_ATTEMPT_NOT_FOUND`, `PAYMENT_ORDER_MISMATCH`, `PAYMENT_VERIFICATION_FAILED`, `ORDER_ALREADY_PAID`.

Audit: `PAYMENT_VERIFIED`, `PAYMENT_VERIFICATION_FAILED`, `ORDER_PAID`.

### `POST /api/webhooks/razorpay`

Verifies the raw request body against the webhook secret before parsing supported events. Provider event IDs are deduplicated. The response is returned quickly after an idempotent state transition and audit write.

Errors use provider-appropriate HTTP responses and are not exposed through the customer error envelope.

Audit: `WEBHOOK_RECEIVED`, `WEBHOOK_REJECTED`, and resulting payment/order state changes.

## Orders

### `GET /api/orders/:orderId`

Returns an order only when it belongs to the authenticated customer and current merchant.

Response includes immutable item snapshots, totals, order status, and high-level payment status. Raw provider payloads and secrets are never returned.

Errors: `ORDER_NOT_FOUND`.

## State machines

Cart:

```text
ACTIVE → CHECKOUT_PENDING → CONVERTED
   └───────────────→ ABANDONED
CHECKOUT_PENDING ──→ ACTIVE       (recoverable payment failure/cancel)
```

Checkout proposal:

```text
PREPARED → APPROVAL_PENDING → APPROVED → CONSUMED
    │              │              │
    └──────────────┴──────────────┴──→ INVALIDATED / EXPIRED
```

Order:

```text
PENDING → PAYMENT_PENDING → PAID → FULFILLED
              ├──────────→ PAYMENT_FAILED
              └──────────→ CANCELLED
```

Payment attempt:

```text
CREATED → PENDING → AUTHORIZED → CAPTURED → REFUNDED
              └───────────────→ FAILED
```

State transitions occur inside domain modules and database transactions. Route handlers and the future agent cannot write statuses directly.

## Required persistence invariants

- At most one active cart exists for a customer and merchant.
- Cart mutations increment a monotonic cart version.
- A checkout proposal records the cart version and immutable item/price snapshots it evaluated.
- Product stock is decremented only after verified payment, in the transaction that marks the order paid.
- An approval belongs to one customer, one proposal, one amount, and one currency, and has an expiry.
- One approval can create at most one internal order.
- One idempotency key can create at most one payment attempt.
- Provider order IDs, provider payment IDs, and webhook event IDs are unique when present.
- Order items and audit events are append-only.
- All stored monetary amounts are non-negative integer minor units.
- An order and all its payment attempts use the same amount and currency.
- Payment success and order payment completion are committed atomically.
