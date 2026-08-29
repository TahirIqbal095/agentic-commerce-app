# 11 — Reserve inventory and invalidate stale proposals

**What to build:** Protect approval-ready checkout terms with short-lived inventory reservations and force changed commercial terms through a new Checkout Proposal.

**Blocked by:** 00 — Align the application around one Brand; 10 — Prepare a physical-goods Checkout Proposal.

Status: ready-for-agent

- [ ] An approval-ready Checkout Proposal creates a reservation for its exact Products and quantities.
- [ ] Reservation and proposal expiry are configurable within the agreed short checkout window.
- [ ] Expiry releases reserved inventory idempotently.
- [ ] A relevant Cart, stock, price, shipping, tax, or policy change invalidates the existing proposal.
- [ ] The system never silently substitutes Products, reduces quantities, or carries changed terms forward.
- [ ] Refreshing checkout produces a new proposal and discloses material changes to the Customer.
- [ ] Reservation and invalidation decisions create appropriate Audit Events.
