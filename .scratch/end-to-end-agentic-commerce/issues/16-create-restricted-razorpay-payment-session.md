# 16 — Create a restricted Razorpay payment session

**What to build:** Turn one approved internal Order into a Razorpay Standard Checkout session through a narrow MCP adapter that cannot expand the Commerce Agent’s financial authority.

**Blocked by:** 00 — Align the application around one Brand; 14 — Create one immutable internal Order; 15 — Connect a Brand Razorpay Payment Account.

Status: ready-for-agent

- [ ] The application-owned MCP adapter allowlists only the Razorpay Order operations required by this journey.
- [ ] Capture, refund, settlement, payout, Payment Link, S2S payment, resend-OTP, and submit-OTP tools are unavailable to the Commerce Agent.
- [ ] The model supplies only the internal Order identifier; trusted code constructs amount, currency, receipt, Brand account, and permitted metadata.
- [ ] A stable receipt and recorded outbound attempt make uncertain provider creation reconcilable before retry.
- [ ] The returned provider Order is persisted against one immutable payment attempt and internal Order.
- [ ] The Storefront opens Razorpay Standard Checkout, and payment credentials or OTPs never enter conversation or model context.
- [ ] Unexpected MCP capabilities or contract changes fail closed and prevent payment initiation.
