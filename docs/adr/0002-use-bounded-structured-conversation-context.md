# 0002 — Use bounded structured Conversation Context

Status: accepted

## Context

Follow-up Customer messages must refine earlier shopping intent and refer to
recent Recommendations. Replaying full Conversation Transcripts would provide
high conversational fidelity, but would create unbounded model input, expose
unnecessary Customer text, and still be unreliable because durable Transcripts
redact sensitive content.

## Decision

The Commerce Agent receives a bounded, typed Conversation Context rather than
the full Transcript. The intent analyzer receives the current context and the
newest Customer message, emits a typed delta, and deterministic application
code applies validated set and clear operations. Context contains the resolved
Product constraints and the latest ordered Recommendation Set needed for
follow-up references. It is persisted with a schema version and revision so
concurrent turns cannot silently overwrite one another. Each Conversation Turn
has a client-generated idempotency key so network retries return the original
result instead of duplicating the turn.

When a context revision changes during interpretation, the server reloads and
reinterprets the turn once. A second conflict produces a retryable response
rather than overwriting newer context or retrying without a bound.

The exact live Transcript remains a Customer-facing concern. Durable
Transcript text is redacted before storage and is not replayed to the model.

## Consequences

- Model input remains bounded as a Conversation grows.
- Explicit replacement, preservation, and removal rules can be behavior-tested.
- References identify Products, but current Catalog, price, inventory, policy,
  and Approval state remain authoritative.
- A stale concurrent turn must be retried against the latest context revision.
- Duplicate submissions with the same idempotency key return the original
  result.
- Starting a new Conversation removes its Transcript and Context from Customer
  access, while minimal records required by immutable AgentActions or Audit
  Events remain protected.
