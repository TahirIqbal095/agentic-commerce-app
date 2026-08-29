# 18 — Reconcile captured payment from Razorpay webhooks

**What to build:** Make verified Razorpay events the durable authority for payment state and mark the internal Order paid only after capture.

**Blocked by:** 00 — Align the application around one Brand; 16 — Create a restricted Razorpay payment session.

Status: ready-for-agent

- [ ] Webhook verification uses the unmodified raw request body and the configured test or live Payment Account's webhook secret.
- [ ] Invalid signatures are rejected without changing payment or Order state.
- [ ] Provider event identifiers are stored and deduplicated so replay is idempotent.
- [ ] Out-of-order and delayed events obey explicit monotonic state-transition rules.
- [ ] Provider Order creation remains PAYMENT_PENDING, authorization becomes PAYMENT_AUTHORIZED, and only capture makes the internal Order PAID.
- [ ] Failed payment remains immutable attempt history and does not release paid fulfillment.
- [ ] Captured payment consumes the inventory reservation and records payment and Order Audit Events exactly once.
