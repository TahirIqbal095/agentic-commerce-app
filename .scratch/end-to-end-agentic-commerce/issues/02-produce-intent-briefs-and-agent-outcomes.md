# 02 — Produce typed Intent Briefs and Agent Outcomes

**What to build:** Give each persisted customer turn an inspectable Intent Brief and machine-readable Agent Outcome while preserving the current Product discovery experience.

**Blocked by:** 01 — Persist a server-owned conversation.

**Status:** ready-for-human

- [x] A valid turn records a typed Intent Brief containing the goal, constraints, known entities, missing information, confidence, and requested effects.
- [x] The Intent Brief is treated as context and does not directly authorize side effects.
- [x] Successful discovery returns a COMPLETED outcome with trusted Product artifacts and agent-composed language.
- [x] A genuinely ambiguous request returns NEEDS_INPUT with one focused question and the missing information.
- [x] Malformed structured model output is retried once; persistent model or infrastructure failure returns a retryable typed outcome.
- [x] Credentials, private chain-of-thought, and unnecessary personal data are absent from persisted intent and outcome records.
