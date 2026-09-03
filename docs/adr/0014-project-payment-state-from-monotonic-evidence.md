# Project payment state from monotonic provider evidence

Razorpay callbacks, Provider Notifications, MCP results, and reconciliation
reads are retained as separate evidence and projected into payment state with
monotonic rules. Authenticated duplicate or out-of-order facts never regress a
captured Provider Payment or paid Order, and an early Provider Notification is
held until its provider identifiers can be associated safely. This trades a
simple last-write-wins status update for correct behavior under asynchronous
delivery and transport uncertainty.
