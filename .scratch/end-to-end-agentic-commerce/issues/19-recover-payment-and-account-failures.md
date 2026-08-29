# 19 — Recover from payment and Payment Account failures

**What to build:** Give Customers and Brand Admins safe recovery paths for uncertain MCP calls, failed payment attempts, abandoned checkout, and disconnected Razorpay access.

**Blocked by:** 00 — Align the application around one Brand; 17 — Verify the Standard Checkout callback; 18 — Reconcile captured payment from Razorpay webhooks.

Status: ready-for-agent

- [ ] An MCP timeout after Approval preserves the internal Order and records a failed or uncertain payment attempt.
- [ ] An uncertain provider Order creation is reconciled by stable receipt and provider fetch before another create is attempted.
- [ ] A retry creates a new payment attempt only when trusted payment rules allow it and cannot create a duplicate internal Order or charge.
- [ ] Expired or revoked OAuth blocks new payment work and returns PAYMENT_ACCOUNT_ACTION_REQUIRED without losing the Customer’s internal Order.
- [ ] Only an authorized Brand Admin can reconnect the Payment Account; the Customer-facing agent cannot administer OAuth.
- [ ] An initiated but unpaid provider Order can become abandoned without being falsely represented as deleted.
- [ ] Provider status fetch can reconcile latency-sensitive state while verified webhooks remain the durable authority.
