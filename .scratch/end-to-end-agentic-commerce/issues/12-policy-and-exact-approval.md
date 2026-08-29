# 12 — Evaluate policy and capture exact Approval

**What to build:** Apply trusted Brand policy to the exact Checkout Proposal and obtain Customer Approval that cannot authorize different terms.

**Blocked by:** 00 — Align the application around one Brand; 11 — Reserve inventory and invalidate stale proposals.

Status: ready-for-agent

- [ ] Deterministic policy evaluation returns ALLOW, REQUIRE_APPROVAL, or BLOCK with persisted reasons and policy version.
- [ ] The Commerce Agent can explain the policy result but cannot override it.
- [ ] Approval binds to one proposal identifier, exact amount, currency, Cart version, and expiry.
- [ ] Structured Storefront Approval works without relying on model interpretation.
- [ ] Free-form affirmation is accepted only when exactly one active pending proposal in the conversation is unambiguous.
- [ ] Expired, invalidated, rejected, or changed proposals cannot be approved or reused.
- [ ] Policy and Approval transitions are idempotent and recorded as business Audit Events.
