# 08 — Read, update, and remove Cart items safely

**What to build:** Let an authenticated Customer inspect the authoritative Cart, set a Product quantity, and explicitly remove a Product without overwriting concurrent changes.

**Blocked by:** 00 — Align the application around one Brand; 07 — Authenticate the Customer and add a resolved Product.

Status: ready-for-agent

- [ ] The Commerce Agent can retrieve and present the complete authoritative Cart.
- [ ] An explicit request can set an item to a positive quantity within authoritative stock and Cart limits.
- [ ] An explicit removal operation removes an item; quantity zero is not treated as a hidden removal alias.
- [ ] Update and removal require the expected Cart version and server-issued idempotency data.
- [ ] A stale version returns ACTION_CONFLICT with refreshed Cart state and no silent overwrite.
- [ ] Prices, currency, stock, ownership, and totals are loaded by trusted modules and cannot be supplied by the model.
- [ ] Successful mutations record sanitized agent activity and meaningful Audit Events.
