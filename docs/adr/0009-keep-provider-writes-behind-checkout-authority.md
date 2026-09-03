# Keep Provider Writes behind the checkout authority

Conversational Checkout uses Razorpay's remote MCP server only as an outbound
adapter behind deterministic application-owned checkout authority. The
Commerce Agent may explain and propose a purchase, but it cannot invoke a
Provider Write; only an allowlisted operation whose exact Checkout Proposal has
an unexpired, single-use Approval may proceed. This keeps policy, bounds,
Customer authorization, and audit evidence under the Storefront's control
instead of relying on merchant-wide MCP tools that do not enforce those gates.
The remote MCP adapter is the only outbound Razorpay path for this feature; an
outage never falls back to an unrecorded SDK or REST call.
