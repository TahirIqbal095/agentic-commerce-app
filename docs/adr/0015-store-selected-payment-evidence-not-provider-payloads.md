# Store selected payment evidence instead of provider payloads

Checkout Audit Events retain application-owned reason codes, state changes,
amounts, correlation keys, safe Razorpay identifiers, and timestamps rather
than raw MCP requests, callbacks, Provider Notifications, or authorization
headers. Customer Checkout Timelines project an even smaller privacy-safe view.
This sacrifices byte-for-byte provider replay to keep credentials, payment
instrument data, and unnecessary personal information out of durable audit and
Conversation storage.
