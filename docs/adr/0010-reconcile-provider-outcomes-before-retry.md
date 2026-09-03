# Reconcile unknown Provider outcomes before retry

When a Razorpay MCP call loses its response after dispatch, the Storefront
records an Unknown Provider Outcome and reconciles it using the Provider
Operation's stable ID as the Provider Order receipt. A retry may reuse the
existing Approval only when reconciliation confirms absence and every
commercial input is identical; otherwise checkout stops or requires a fresh
Checkout Proposal and Approval. This avoids duplicate Provider Orders without
mistaking a transport failure for a rejected payment.
