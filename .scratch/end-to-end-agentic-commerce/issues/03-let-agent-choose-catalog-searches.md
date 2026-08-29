# 03 — Let the Commerce Agent choose Catalog searches

**What to build:** Replace application-owned discovery dispatch with a bounded Commerce Agent that receives permitted Catalog tools and decides when and how to search for Products.

**Blocked by:** 00 — Align the application around one Brand; 02 — Produce typed Intent Briefs and Agent Outcomes.

Status: ready-for-agent

- [ ] Trusted capability resolution provides only the Storefront's Catalog discovery tools for an ordinary Product request.
- [ ] The Commerce Agent chooses and executes Catalog search rather than application code branching on an intent label.
- [ ] The agent loop is bounded by a five-step limit, timeout, token budget, and bounded tool results.
- [ ] Reaching a limit produces the best grounded outcome or NEEDS_INPUT rather than invented Products or silent continuation.
- [ ] Catalog and other trusted commerce modules remain independent of model and AI SDK types.
- [ ] The hard-coded Product-discovery dispatcher is removed after replacement behavior is green.
