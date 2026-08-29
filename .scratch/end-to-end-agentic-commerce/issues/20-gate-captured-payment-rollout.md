# 20 — Gate the complete captured-payment journey for rollout

**What to build:** Prove and safely release the Storefront journey from Product discovery through captured Razorpay payment.

**Blocked by:** 00 — Align the application around one Brand; 09 — Apply atomic Cart batches and undo eligible changes; 13 — Cancel checkout and release reservations; 19 — Recover from payment and Payment Account failures.

Status: ready-for-agent

- [ ] End-to-end deterministic tests cover discovery, references, explicit Cart mutations, Checkout Proposal, Approval, Order creation, Standard Checkout, and captured payment.
- [ ] Adversarial evaluations cover prompt injection, Brand-selector injection, ambiguous mutation, stale Cart, duplicate actions, changed proposal terms, and payment without Approval.
- [ ] Idempotency, concurrency, timeout, OAuth-disconnect, duplicate-webhook, and out-of-order-webhook recovery paths are verified.
- [ ] Operational traces omit chain-of-thought and secrets, while meaningful business actions have complete Audit Events.
- [ ] Discovery, Cart, checkout, and Razorpay payment capabilities can be enabled independently per deployment environment.
- [ ] Every mutating capability has a tested disable path that does not restore the legacy hard-coded dispatcher.
- [ ] Test-mode promotion passes before live Storefront activation, and environment indicators prevent test/live confusion.
- [ ] Captured payment is the terminal outcome for this release; refunds, guest checkout, saved methods, and fulfillment operations remain unavailable.
