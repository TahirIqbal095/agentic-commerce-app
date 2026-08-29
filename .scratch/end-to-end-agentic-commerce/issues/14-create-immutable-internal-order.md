# 14 — Create one immutable internal Order

**What to build:** Consume one valid Approval to create one immutable internal Order immediately before provider payment work begins.

**Blocked by:** 00 — Align the application around one Brand; 12 — Evaluate policy and capture exact Approval.

Status: ready-for-agent

- [ ] Order creation revalidates that the Checkout Proposal and Approval are exact, active, unexpired, and unconsumed.
- [ ] The Order snapshots Product names, quantities, prices, totals, currency, Customer, Cart, proposal, and Approval; its Brand is implicit in the deployment.
- [ ] Each proposal and Approval can create at most one Order.
- [ ] A replay for the same approved proposal returns the existing Order rather than creating another one.
- [ ] Commercial Order fields are immutable after creation.
- [ ] Successful creation consumes the proposal and Approval and records an Audit Event in the same authoritative transition.
