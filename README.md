# Agentic Commerce App

A reusable agentic commerce Storefront for exactly one Brand per deployment.
The Commerce Agent helps Customers discover the Brand's Products, manage a
Cart, approve exact checkout terms, place an Order, and pay through the Brand's
connected Payment Account.

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

Conversations resolve the current User on the server. Set `USER_ID` to the User
UUID. It can be omitted when the database contains exactly one User.

Cart actions resolve a Customer from `CUSTOMER_ID`. It can be omitted when the
database contains exactly one User. The demo seed creates a Customer, Arc, and
Arc's Product Catalog.

The Catalog endpoints are:

- `GET /api/products`
- `GET /api/products/:productId`

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

Send a Customer message to `POST /api/agent/message`:

```json
{ "message": "I want road-running shoes under ₹5,000" }
```

The same endpoint accepts explicit Cart requests:

```json
{ "message": "add two StrideFlow Daily Running Shoes to my cart" }
```

Cart, checkout, Approval, Order, Brand Payment Account, and captured-payment
capabilities are tracked as planned work under `.scratch/end-to-end-agentic-commerce/`.
