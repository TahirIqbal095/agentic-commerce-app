# 10 — Prepare a physical-goods Checkout Proposal

**What to build:** Turn an authenticated Customer’s checkout request into a complete, immutable preview of the exact physical-goods purchase rather than immediately initiating payment.

**Blocked by:** 00 — Align the application around one Brand; 08 — Read, update, and remove Cart items safely.

Status: ready-for-agent

- [ ] Products have an explicit fulfillment type, and physical fulfillment is not inferred from description text.
- [ ] The Customer supplies or selects delivery details through structured input rather than unvalidated conversational prose.
- [ ] Trusted pricing and shipping rules calculate subtotal, discount, shipping, tax, total, currency, and delivery estimate.
- [ ] Zero shipping or tax is used only when explicitly configured by the Brand.
- [ ] “Checkout,” “buy,” or “pay” prepares an immutable, expiring Checkout Proposal and does not initiate Razorpay payment.
- [ ] The proposal snapshots Cart version, Products, quantities, commercial totals, warnings, and configuration versions.
- [ ] The Storefront renders the complete proposal for Customer review.
