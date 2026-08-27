# 01 — Persist a server-owned conversation

**What to build:** Make the existing shopping experience create or resume a server-owned conversation so a Customer can continue shopping across turns without trusting browser-supplied history.

**Blocked by:** None — can start immediately.

Status: complete

- [x] A first valid customer message creates a Merchant- and User-scoped conversation and returns its identifier with the existing assistant result.
- [x] A later message with that identifier resumes the same conversation and appends the new USER and ASSISTANT messages in order.
- [x] The Storefront reuses the returned conversation identifier for later turns without resending authoritative history.
- [x] A conversation owned by another User or Merchant is rejected before the Commerce Agent runs.
- [x] Existing Product discovery remains usable through the interface and Storefront.
- [x] Behavior is covered test-first through the confirmed Commerce Agent seam and request interface.
