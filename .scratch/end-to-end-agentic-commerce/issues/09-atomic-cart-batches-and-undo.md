# 09 — Apply atomic Cart batches and undo eligible changes

**What to build:** Make compound Cart requests predictable and let a Customer safely reverse the latest eligible Cart change.

**Blocked by:** 00 — Align the application around one Brand; 08 — Read, update, and remove Cart items safely.

Status: ready-for-agent

- [ ] A multi-item request validates all requested changes before applying any of them.
- [ ] A valid batch applies in one transaction and returns one authoritative Cart summary.
- [ ] If any requested change is invalid, the entire batch fails without a partial mutation.
- [ ] Each mutation records before and after Cart versions and enough trusted detail to determine undo eligibility.
- [ ] “Undo that” reverses the latest eligible mutation when no intervening Cart change exists.
- [ ] An intervening or ambiguous change prevents automatic undo and returns a focused explanation or NEEDS_INPUT.
