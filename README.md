## Commerce API configuration

The product API resolves its merchant context on the server. Set `MERCHANT_ID` to
the UUID of the storefront merchant. For local, single-merchant databases it can
be omitted; the API will use the only merchant present. If the database contains
zero or multiple merchants, `MERCHANT_ID` is required.

The catalog endpoints are:

- `GET /api/products`
- `GET /api/products/:productId`
