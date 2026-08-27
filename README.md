## Commerce API configuration

The product API resolves its merchant context on the server. Set `MERCHANT_ID` to
the UUID of the storefront merchant. For local, single-merchant databases it can
be omitted; the API will use the only merchant present. If the database contains
zero or multiple merchants, `MERCHANT_ID` is required.

Conversations resolve the current User on the server. Set `USER_ID` to the User
UUID. It can be omitted when the database contains exactly one User.

Cart actions also resolve a customer context on the server. Set `CUSTOMER_ID` to
the customer's user UUID. It can be omitted when the database contains exactly
one user. Running `pnpm db:seed` creates the local demo customer and catalog.

The catalog endpoints are:

- `GET /api/products`
- `GET /api/products/:productId`

## AI shopping assistant

The shopping assistant uses the Vercel AI SDK with Google's Gemini Developer
API to convert a customer message into a structured catalog intent before
retrieving products. It calls Google directly and does not use Vercel AI
Gateway. Add these values to `.env` for local development:

```dotenv
GOOGLE_GENERATIVE_AI_API_KEY=your_google_ai_studio_key
GOOGLE_GENERATIVE_AI_MODEL=
```

The assistant endpoint is `POST /api/agent/message` with a JSON body such as:

```json
{ "message": "I want good sound quality earphones under ₹5,000" }
```

The same endpoint accepts explicit cart requests:

```json
{ "message": "add two StrideFlow Daily Running Shoes to my cart" }
```
