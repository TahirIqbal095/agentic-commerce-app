# Agentic Commerce App

A reusable agentic commerce Storefront for exactly one Brand per deployment.
The Commerce Agent helps Customers discover the Brand's Products, manage a
Cart, and complete a **Razorpay Test Mode** checkout. Real-money collection,
production payment enablement, inventory commitment, and fulfilment are
deliberately out of scope.

This application is not a Marketplace. Supporting multiple Brands, sellers, or
shared commerce data in one deployment is intentionally out of scope.

## Local setup

Start Postgres, apply the schema, and seed the Arc demo Brand and Catalog:

```bash
docker compose up -d postgres
pnpm db:migrate
pnpm db:seed
pnpm dev
```

The database must contain exactly one Brand. Storefront APIs fail with a
configuration error when the Brand record is missing; clients and models cannot
select a different Brand.

The demo seed creates Arc and its INR-only Product Catalog. A browser-scoped
Guest Session owns each Customer's Conversation and Cart. The server lazily
issues a secure, HTTP-only `guest_session` cookie on the first state-changing
request; Catalog browsing creates no Guest Session.

The Catalog endpoints are:

- `GET /api/products`
- `GET /api/products/:productId`
- `GET /api/cart`

## Commerce Agent

The Commerce Agent uses the Vercel AI SDK with Google's Gemini Developer API.
It interprets a Customer request, chooses from bounded Catalog tools, observes
authoritative results, and returns a grounded outcome. It does not use the
Vercel AI Gateway.

Add these values to `.env` for local development:

```dotenv
GOOGLE_GENERATIVE_AI_API_KEY=your_google_ai_studio_key
GOOGLE_GENERATIVE_AI_MODEL=
```

Send a Customer message with a client-generated Conversation Turn idempotency
key to `POST /api/agent/message`:

```json
{
  "idempotencyKey": "61000000-0000-4000-8000-000000000001",
  "message": "I want road-running shoes under ₹5,000"
}
```

The same endpoint accepts explicit Cart requests:

```json
{
  "conversationId": "41000000-0000-4000-8000-000000000001",
  "idempotencyKey": "61000000-0000-4000-8000-000000000002",
  "message": "add two of the first one"
}
```

Cart inspection and one-Product additions are implemented. Product prices are
immutable and Cart Prices remain stable.

## Conversational Checkout (Razorpay Test Mode)

A Customer reaches checkout from the Cart's **Check out** control or by asking
for it in the Conversation; both enter the same deterministic checkout
authority. A ready Cart produces an exact, ten-minute Checkout Proposal whose
total equals the Cart Subtotal, with Discount, Shipping, and Tax explicitly ₹0.
Only the Approval control — labelled with the exact INR amount — authorizes
payment; typed words such as "yes" or "buy it" never do.

Approval atomically creates an immutable Order and one retry-safe Provider
Operation, which creates one Provider Order through Razorpay's hosted MCP
server. Razorpay's own managed Checkout then collects every payment
instrument, contact detail, and OTP; none of it reaches the Conversation, the
Commerce Agent, or an Audit Event. The Order becomes PAID only from Razorpay's
own captured state, verified on the server.

The narrow command and query boundaries are:

- `POST /api/checkout/proposal`
- `POST /api/checkout/approval`
- `GET /api/checkout/:orderId` — status and Checkout Timeline
- `POST /api/checkout/:orderId/reconcile`
- `POST /api/checkout/:orderId/payment-attempt`
- `POST /api/checkout/:orderId/callback`
- `POST /api/webhooks/razorpay` — authenticated Provider Notifications

### Configuration

Razorpay **Test Mode is mandatory**. A live key, an absent credential, or a
webhook secret that repeats the API secret disables checkout with an
explanation; the rest of the Storefront keeps working. Store all three in
separate server-only variables — never prefix them with `NEXT_PUBLIC_`:

```dotenv
RAZORPAY_TEST_KEY_ID=rzp_test_your_key_id
RAZORPAY_TEST_KEY_SECRET=your_test_key_secret
RAZORPAY_WEBHOOK_SECRET=a_distinct_webhook_signing_secret
```

Point the Razorpay dashboard's webhook at `/api/webhooks/razorpay` and sign it
with `RAZORPAY_WEBHOOK_SECRET`.

### Demonstrating recovery from a lost provider response

Outside production only, set `CHECKOUT_FAULT=LOSE_CREATE_ORDER_RESPONSE` to
make the adapter dispatch one Provider Order creation and discard its response.
The Storefront records an Unknown Provider Outcome, reconciles by the stable
receipt, verifies the matching Provider Order, and continues — without a second
`create_order` and without asking the Customer to pay twice. Customer input and
production builds cannot activate the fault.

### Tests

```bash
pnpm test              # hermetic; never contacts Razorpay and needs no secrets
pnpm test:integration  # needs a running Postgres
pnpm test:smoke        # opt-in; needs real Razorpay Test Mode credentials
```

`pnpm test:smoke` makes real Test Mode calls to the hosted Razorpay MCP server
and is never run by ordinary CI.

### Known limitations

This checkout revalidates Product availability and stock when Approval is
consumed but does **not** reserve, decrement, release, or fulfil inventory.
Customer access to a Checkout Timeline ends when the Guest Session cookie is
lost or expires, and the timeline says so where the Customer reads it; the
Brand's Orders, Provider Operations, Payment Attempts, Provider Payments, and
Audit Events survive that expiry for reconciliation. Production payment
enablement stays blocked until inventory commitment and late-payment behaviour
are designed.
