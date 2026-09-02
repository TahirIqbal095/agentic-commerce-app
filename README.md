# Agentic Commerce App

A reusable agentic commerce Storefront for exactly one Brand per deployment.
The Commerce Agent helps Customers discover the Brand's Products, manage a
Cart, and prepare for a future checkout flow. Checkout, Orders, and payments
are not implemented in the current scope.

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
immutable and Cart Prices remain stable. Checkout behavior is planned from the
future Checkout Readiness boundary; no speculative checkout or payment schema
is retained.
