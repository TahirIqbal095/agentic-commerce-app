# Separate Provider Operations from Payment Attempts

A Provider Operation records the single logical creation of an Order's one
Provider Order, including transport retries and reconciliation, while each
explicit Razorpay Checkout launch is a separate Payment Attempt that may
produce a Provider Payment. This split keeps `create_order` idempotency distinct
from Customer payment retries and preserves the provider's one-order-to-many-
payments relationship without permitting duplicate Provider Orders.
