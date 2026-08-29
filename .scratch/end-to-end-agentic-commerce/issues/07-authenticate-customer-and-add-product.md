# 07 — Authenticate the Customer and add a resolved Product

**What to build:** Preserve anonymous Product discovery while allowing an authenticated Customer to explicitly add one unambiguous, previously resolved Product to an authoritative Cart.

**Blocked by:** 00 — Align the application around one Brand; 05 — Resume multi-turn discovery and resolve Product references; 06 — Gate and evaluate agent capabilities.

Status: ready-for-agent

- [ ] Anonymous Customers can continue Product discovery but cannot perform persistent Cart mutations.
- [ ] Trusted Customer identity and a configured singleton Brand are required before the add capability is made available.
- [ ] An explicit request can add an authoritative Product identifier and quantity to the Customer’s Cart.
- [ ] Interest or preference language alone does not enable or execute the mutation.
- [ ] Ambiguous Product references return NEEDS_INPUT without changing the Cart.
- [ ] A server-issued idempotency key makes retries return the original result rather than add twice.
- [ ] The response contains an authoritative complete Cart summary, and a business Audit Event records the mutation.
