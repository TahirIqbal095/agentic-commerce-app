# 0003 — Keep Cart mutations authoritative and retry-safe

Status: accepted

## Context

The Commerce Agent must interpret conversational Cart requests, and Customers
can also use controls on the current Cart Summary. Model tool calls, interactive
commands, and Conversation Turn retries can repeat. Allowing either the model
or client to supply prices, totals, availability decisions, or direct
persistence would make Cart state untrustworthy and could apply a Cart Mutation
more than once.

## Decision

The model and interactive controls request additions, Cart Item Removals, Cart
Quantity Changes, and clearing through narrow Cart capabilities. Application
code resolves Customer ownership, rereads authoritative Cart and Product data,
validates currency, availability, stock, and quantity limits, and calculates
Cart Prices and the Cart Subtotal. A Cart Item always has a positive whole-unit
quantity; removal is explicit rather than represented by quantity zero.

All Cart Mutations requested by one Conversation Turn form one atomic change.
That change and its result are associated with the turn's idempotency key so a
retry returns the original result without applying it again. Distinct
concurrent relative changes, such as incrementing quantity, apply to the latest
authoritative Cart through serialization or bounded conflict retries. Exact
quantity changes replace the authoritative quantity. Neither the model nor the
client writes Cart state directly or reports a mutation that authoritative
application code did not complete.

Increasing a Cart Item's quantity reprices the entire Cart Item at the current
authoritative Product price and discloses any difference. Decreasing quantity
retains its Cart Price. Removing a Cart Item and clearing a Cart do not reprice
other Cart Items. Mutating a Cart invalidates any unconsumed Checkout Proposal
and pending Approval prepared from an earlier Cart version; an existing Order
is unaffected.

Relative quantity commands apply to the latest authoritative quantity, while
an exact quantity command replaces it. Quantities remain whole units from one
through ten and may be further limited by authoritative stock. Restoring a
recently removed Cart Item is a new retry-safe mutation that retains its prior
quantity and Cart Price when current Product validity and stock permit it.

Creating an Order converts its Cart into read-only history. Later shopping
creates a new active Cart rather than reopening the converted Cart, including
when payment for the Order later fails.

## Consequences

- Multi-operation Cart requests either all succeed or leave the Cart unchanged.
- Correctable failures return authoritative reasons and the unchanged Cart.
- Reading a Cart does not reprice it; current price and availability changes
  are disclosed separately.
- Interactive commands create deterministic Conversation Turns, and only the
  latest Cart Summary is interactive. Earlier summaries remain read-only.
- The Storefront loads the persisted Cart quantity independently of the current
  Conversation, and its Cart control produces an authoritative Cart inspection
  turn rather than relying on a prior summary.
- Conversation completion and Cart persistence require coordinated
  idempotency rather than independent best-effort writes.
