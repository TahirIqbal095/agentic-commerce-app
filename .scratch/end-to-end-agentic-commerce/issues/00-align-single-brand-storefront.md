# 00 — Align the application around one Brand

**What to build:** Make the documentation, persistence model, runtime, tests,
seed data, prompts, and Storefront consistently describe and enforce one Brand
per deployment.

**Blocked by:** None — can start immediately.

Status: complete

## Acceptance criteria

- [x] The domain language consistently uses Brand and Storefront and explicitly
  treats marketplace and multi-brand architecture as out of scope.
- [x] The database enforces one configured Brand and commerce records do not
  repeat implicit Brand ownership.
- [x] Product and Commerce Agent APIs have no environment, client, or model
  mechanism for Brand selection.
- [x] Conversations, Carts, Approvals, Orders, and payments retain authenticated
  Customer ownership boundaries.
- [x] Arc demo data, Storefront copy, prompts, and package metadata are
  consistent with the reusable `agentic-commerce-app` identity.
- [x] Unresolved roadmap issues describe the single-Brand architecture without
  claiming planned behavior is already implemented.
- [x] Tests, lint, type checking, and the production build pass.

## Comments

- This issue supersedes Merchant-scoping details in completed issue 01 while
  preserving its server-owned conversation behavior and User isolation.
- Verification passed with the unit/UI suite, database integration suite,
  ESLint, TypeScript, migration application, and the documented Next.js webpack
  production-build fallback. The default Turbopack build could not run in the
  execution sandbox because its PostCSS worker was denied local port binding.
