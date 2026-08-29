# 15 — Connect a Brand Razorpay Payment Account

**What to build:** Let an authorized Brand Admin connect and reconnect the Brand’s Razorpay Payment Account without exposing provider credentials to the Commerce Agent.

**Blocked by:** 00 — Align the application around one Brand.

Status: ready-for-agent

- [ ] An authorized Brand Admin can begin Razorpay OAuth Authorization Code flow with PKCE and CSRF state protection.
- [ ] The callback binds the authorized Razorpay account to the singleton Brand's Payment Account for the selected test or live environment.
- [ ] Access and refresh credentials are encrypted or represented by secure secret references and never enter model prompts or customer responses.
- [ ] Connection status and environment are visible to the Brand Admin without revealing secrets.
- [ ] Test and live Payment Accounts, credentials, webhook secrets, and records are isolated with no fallback between them.
- [ ] Revoked or expired access is represented explicitly and can be reconnected only by an authorized Brand Admin.
- [ ] Development API-key configuration remains limited to an explicit single-Brand non-production mode.
