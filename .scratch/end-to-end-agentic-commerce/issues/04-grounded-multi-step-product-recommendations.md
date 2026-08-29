# 04 — Deliver grounded multi-step Product recommendations

**What to build:** Let the Commerce Agent refine weak searches and inspect authoritative Product details before presenting a concise, evidence-backed recommendation set.

**Blocked by:** 00 — Align the application around one Brand; 03 — Let the Commerce Agent choose Catalog searches.

Status: ready-for-agent

- [ ] The Commerce Agent can perform more than one Catalog search when the first result is inadequate.
- [ ] The Commerce Agent can inspect selected Products before recommending them.
- [ ] Normally three to five Products are presented, and arbitrary weak matches are not used merely to fill the response.
- [ ] Every presented Product and factual claim is traceable to current Catalog tool output.
- [ ] Missing Catalog evidence is described as unknown rather than inferred or fabricated.
- [ ] Instructions embedded in Product content or tool output cannot alter the agent’s authority or behavior.
- [ ] Sanitized run and tool activity are persisted with turn, step, status, timing, and configuration provenance without chain-of-thought.
