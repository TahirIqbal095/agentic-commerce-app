# Keep Test Checkout out of inventory and fulfillment

The Razorpay Test Checkout slice revalidates Product availability and stock
when Approval is consumed but does not reserve, decrement, release, or fulfill
inventory. The Checkout Timeline discloses that limitation, and configuration
must prevent production payment enablement until inventory commitment and late
payment behavior are designed. This preserves a truthful payment integration
demonstration without disguising an incomplete fulfillment model as
production-ready commerce.
