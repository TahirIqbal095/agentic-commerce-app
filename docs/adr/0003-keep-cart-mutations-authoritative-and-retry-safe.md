# 0003 — Keep Cart mutations authoritative and retry-safe

Status: accepted

## Context

The Commerce Agent must interpret conversational Cart requests, but model tool
calls and Conversation Turn retries can repeat. Allowing the model to supply
prices, totals, availability decisions, or direct persistence would make Cart
state untrustworthy and could add the same Product more than once.

## Decision

The model selects Products and positive whole-unit quantities through narrow
Cart capabilities. Application code resolves Customer ownership, rereads
authoritative Product data, validates currency, availability, stock, and
quantity limits, and calculates Cart Prices and the Cart Subtotal.

All additions requested by one Conversation Turn form one atomic mutation.
That mutation and its result are associated with the turn's idempotency key so
a retry returns the original result without adding again. Distinct concurrent
turns must retain every valid addition through serialization or bounded
conflict retries. The model never writes Cart state directly or reports an
addition that authoritative application code did not complete.

## Consequences

- Multi-Product additions either all succeed or leave the Cart unchanged.
- Correctable failures return authoritative reasons and the unchanged Cart.
- Reading a Cart does not reprice it; current price and availability changes
  are disclosed separately.
- Conversation completion and Cart persistence require coordinated
  idempotency rather than independent best-effort writes.
