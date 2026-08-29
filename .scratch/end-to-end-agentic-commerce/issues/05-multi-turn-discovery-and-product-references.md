# 05 — Resume multi-turn discovery and resolve Product references

**What to build:** Let a Customer refine prior requests, answer clarification questions, and refer naturally to Products already presented by the Commerce Agent.

**Blocked by:** 00 — Align the application around one Brand; 04 — Deliver grounded multi-step Product recommendations.

Status: ready-for-agent

- [ ] Relevant recent turns, active constraints, unresolved questions, and recent Product presentations form a bounded working context.
- [ ] A refinement such as “only waterproof ones” updates the active request without requiring the Customer to repeat prior constraints.
- [ ] Each Product response persists an ordered presentation artifact linked to its assistant message.
- [ ] An ordinal reference such as “the second one” resolves against the latest relevant presentation and produces an authoritative Product identifier.
- [ ] An ambiguous reference returns NEEDS_INPUT and does not choose a Product autonomously.
- [ ] Only one active run may advance a conversation; a concurrent turn receives a retryable conflict.
