# 17 — Verify the Standard Checkout callback

**What to build:** Give the Customer immediate payment feedback after Razorpay Standard Checkout without treating browser success as authoritative payment completion.

**Blocked by:** 00 — Align the application around one Brand; 16 — Create a restricted Razorpay payment session.

Status: ready-for-agent

- [ ] The server verifies the Checkout response signature against the expected provider Order and Brand Payment Account.
- [ ] Invalid, mismatched, replayed, wrong-environment, or wrong-Payment-Account callback data is rejected and audited.
- [ ] A valid callback records the provider payment reference and returns an immediate pending or authorized experience.
- [ ] Browser callback success alone never marks the internal Order PAID.
- [ ] The Customer can safely reload or revisit the conversation without replaying the callback transition.
- [ ] No payment credentials, OTPs, or provider secrets are persisted in conversation history.
