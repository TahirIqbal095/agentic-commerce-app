# 06 — Gate and evaluate agent capabilities

**What to build:** Give operators a controlled promotion path for agentic discovery before any mutation capability is added.

**Blocked by:** 00 — Align the application around one Brand; 04 — Deliver grounded multi-step Product recommendations.

Status: ready-for-agent

- [ ] Discovery can be enabled or disabled per deployment environment without changing prompts or deploying a second dispatcher.
- [ ] Every run records Intent Schema, agent-instruction, tool-contract, model/provider, and capability versions.
- [ ] Deterministic evaluations cover intent, clarification, Product grounding, tool choice, loop limits, and rejection of Brand-selection input.
- [ ] Separate model-backed evaluations cover paraphrases, weak results, relevance, prompt injection, and unsupported claims.
- [ ] A failed promotion gate prevents the new configuration from becoming active.
- [ ] Operators can disable agentic discovery without restoring a permanent competing orchestration path.
