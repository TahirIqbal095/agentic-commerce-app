Status: ready-for-agent

# End-to-End Agentic Commerce

## Problem Statement

The current shopping assistant is not a proper agentic system. It asks a model
to classify a customer message into a structured intent, then application code
uses a hard-coded branch to decide whether to search the Catalog or change the
Cart. The Commerce Agent therefore does not choose actions, observe tool
results, refine its approach, ask for missing information, or coordinate an
end-to-end purchase.

Customers need a conversational Commerce Agent that understands what they want,
finds relevant Products, remembers prior turns, resolves references, changes the
Cart when explicitly asked, prepares exact checkout terms, obtains Approval,
and coordinates payment. The system must remain trustworthy: the model may
decide how to use permitted tools, but it must not control identity, authority,
prices, stock, Cart concurrency, Checkout Proposal terms, Approval, Order state,
or payment truth.

## Solution

Build a two-stage agentic commerce system. An Intent Analyzer converts each
customer turn into a typed, inspectable Intent Brief containing the goal,
constraints, known entities, missing information, confidence, and requested
effects. Trusted application policy resolves which capabilities are permitted
for that turn. A bounded, tool-using Commerce Agent receives the original
message, Intent Brief, relevant conversation context, and only the permitted
tools. It chooses which tools to call, observes results, searches or inspects
again when useful, asks focused clarifying questions, and returns a grounded
outcome.

The agent operates inside deterministic commerce workflows. Catalog, Cart,
checkout, policy, inventory, Ordering, and payment modules enforce authoritative
rules and return authoritative artifacts. Conversations, messages, agent runs,
tool activity, and meaningful business events are persisted without storing
private chain-of-thought. The system is delivered in vertical slices, beginning
with agentic Product discovery and extending through Cart operations, Checkout
Proposal and Approval, internal Order creation, restricted Razorpay MCP order
operations, Razorpay Standard Checkout, and verified payment reconciliation.

## User Stories

1. As a Customer, I want to describe the Product I need in natural language, so that I do not need to understand the Catalog structure.
2. As a Customer, I want the Commerce Agent to preserve my explicit price, size, feature, availability, and use-case constraints, so that results fit my request.
3. As a Customer, I want the Commerce Agent to search more than once when initial results are weak, so that I receive better candidates.
4. As a Customer, I want the Commerce Agent to inspect authoritative Product details before recommending a Product, so that recommendations are grounded.
5. As a Customer, I want a small evidence-backed set of relevant Products, so that I am not overwhelmed by arbitrary Catalog matches.
6. As a Customer, I want the Commerce Agent to explain why each recommended Product fits, so that I can make an informed choice.
7. As a Customer, I want the Commerce Agent to distinguish known Product facts from unknown information, so that it does not mislead me.
8. As a Customer, I want the Commerce Agent to ask one focused question when a missing preference materially affects the result, so that discovery can continue efficiently.
9. As a Customer, I want the Commerce Agent to say when the Catalog cannot support my request, so that it does not invent a Product.
10. As a Customer, I want unavailable Products excluded unless I explicitly request them, so that recommendations are actionable.
11. As a Customer, I want my conversation to continue across turns, so that I can refine a request without repeating everything.
12. As a Customer, I want phrases such as “only waterproof ones” to refine the prior request, so that shopping feels conversational.
13. As a Customer, I want phrases such as “the second one” to resolve to the Products most recently presented, so that I can refer to visible choices naturally.
14. As a Customer, I want ambiguous Product references clarified before a Cart mutation, so that the wrong Product is not selected.
15. As a Customer, I want concise progress such as “Searching the catalog,” so that I understand what the Commerce Agent is doing without seeing internal reasoning.
16. As a Customer, I want an anonymous visitor to discover Products, so that sign-in is not required merely to browse.
17. As a Customer, I want authentication required before persistent Cart or payment actions, so that those actions belong to me.
18. As a Customer, I want an explicit request to be required before the Commerce Agent changes my Cart, so that interest alone does not cause a mutation.
19. As a Customer, I want to add a resolved Product and quantity to my Cart conversationally, so that I can act on a recommendation.
20. As a Customer, I want to inspect my authoritative Cart through the conversation, so that I know its current contents and totals.
21. As a Customer, I want to set an item’s quantity explicitly, so that updates have predictable meaning.
22. As a Customer, I want to remove an item explicitly, so that removal is not hidden behind a special quantity value.
23. As a Customer, I want a multi-item Cart change to succeed atomically, so that I do not receive an unexpected partial result.
24. As a Customer, I want repeated requests and network retries to avoid duplicate Cart changes, so that retries are safe.
25. As a Customer, I want stale Cart conflicts explained and refreshed, so that one browser tab does not silently overwrite another.
26. As a Customer, I want to undo the latest eligible Cart change, so that I can recover from a mistake when no conflicting change has occurred.
27. As a Customer, I want every Cart response to use authoritative prices, currency, availability, and totals, so that model output cannot alter commercial facts.
28. As a Customer, I want “checkout” to prepare exact terms rather than immediately charge me, so that I can review the purchase.
29. As a Customer, I want a Checkout Proposal to show Products, quantities, subtotal, discounts, shipping, tax, total, currency, warnings, and expiry, so that I know exactly what I am approving.
30. As a Customer, I want price or stock changes disclosed rather than silently accepted, so that the purchase remains intentional.
31. As a Customer, I want unsupported stock or delivery conditions to produce clear options, so that the agent does not substitute Products or quantities without permission.
32. As a Customer, I want to provide or select delivery details through structured UI, so that sensitive address data is accurate and minimized.
33. As a Customer, I want eligible shipping methods and delivery estimates calculated by trusted rules, so that the agent does not invent them.
34. As a Customer, I want tax and shipping included in the authoritative total, so that the payable amount is complete.
35. As a Customer, I want a short-lived inventory reservation for an approval-ready Checkout Proposal, so that scarce stock is less likely to disappear while I pay.
36. As a Customer, I want an expired or changed Checkout Proposal refreshed, so that Approval never carries to different terms.
37. As a Customer, I want brand policy decisions explained, so that I understand whether checkout is allowed, blocked, or requires Approval.
38. As a Customer, I want Approval bound to one exact Checkout Proposal, amount, currency, Cart version, and expiry, so that a general “yes” cannot authorize changed terms.
39. As a Customer, I want a free-form affirmative response accepted only when one pending proposal is unambiguous, so that conversational Approval remains safe.
40. As a Customer, I want an approved proposal consumed only once, so that retries cannot create duplicate Orders.
41. As a Customer, I want payment to open Razorpay Standard Checkout, so that card, bank, UPI, and OTP interactions remain within Razorpay’s secure interface.
42. As a Customer, I want payment initiation to use the exact approved internal Order amount, so that the model cannot choose what I pay.
43. As a Customer, I want immediate feedback after Razorpay Checkout while durable payment status is reconciled server-side, so that the experience is responsive and trustworthy.
44. As a Customer, I want only a captured Razorpay payment to mark my internal Order as paid, so that authorization is not mistaken for settlement-ready payment.
45. As a Customer, I want a failed or unavailable payment provider to produce a safe retry path, so that I do not accidentally create duplicate charges or Orders.
46. As a Customer, I want cancellation before internal Order creation to reject the proposal and release reservations, so that abandoned purchases do not hold stock.
47. As a Customer, I want an initiated but unpaid Razorpay Order to be treated as abandoned rather than falsely deleted, so that status remains accurate.
48. As a Customer, I want my payment credentials, OTPs, OAuth tokens, and unrelated personal data excluded from model prompts and conversation storage, so that sensitive information remains protected.
49. As a Brand Admin, I want the Storefront bound to its one configured Brand, so that a client or model cannot select a different Catalog or Payment Account.
50. As a Brand Admin, I want to connect the Brand's Razorpay Payment Account through OAuth, so that payments are collected through its authorized account.
51. As a Brand Admin, I want to reconnect an expired or revoked Payment Account, so that customers can resume payment without exposing credentials to the Commerce Agent.
52. As a Brand Admin, I want deterministic policy evaluation against exact Checkout Proposal terms, so that the model cannot override commercial policy.
53. As a Brand Admin, I want meaningful Cart, Approval, Order, and payment decisions recorded as Audit Events, so that business activity is accountable.
54. As a Brand Admin, I want Product content treated as untrusted data rather than agent instructions, so that Catalog text cannot hijack the Commerce Agent.
55. As an operator, I want new agent capabilities enabled per deployment environment, so that risky tools can be rolled out gradually.
56. As a Brand Admin, I want test and live Razorpay Payment Accounts isolated, so that development activity cannot affect live payments.
57. As an operator, I want every agent run linked to its conversation, turn, model, prompt version, tool contract, and sanitized tool activity, so that behavior can be diagnosed.
58. As an operator, I want private chain-of-thought excluded from persistence, so that traces contain observable evidence rather than hidden reasoning.
59. As an operator, I want only one active run per conversation, so that concurrent turns cannot race against the same context.
60. As an operator, I want typed outcomes for completion, clarification, conflicts, temporary failures, and payment action, so that clients can recover correctly.
61. As an operator, I want the agent loop bounded by steps, result sizes, time, and tokens, so that runaway execution is contained.
62. As an operator, I want newly published Razorpay MCP tools denied by default, so that hosted capability changes do not expand agent authority.
63. As an operator, I want MCP tool contracts validated at startup and in test mode, so that schema drift fails closed.
64. As an operator, I want Razorpay webhook signatures verified against raw request bodies, so that forged payment events are rejected.
65. As an operator, I want duplicate and out-of-order webhooks processed idempotently, so that payment state remains consistent.
66. As an operator, I want uncertain Razorpay Order creation reconciled using a stable receipt, so that timeouts do not create duplicate provider Orders.
67. As a developer, I want one high public behavior seam for the Commerce Agent, so that orchestration can evolve without coupling tests to implementation details.
68. As a developer, I want model autonomy separated from trusted commerce invariants, so that adding tools does not weaken domain safety.
69. As a developer, I want prompts, intent schemas, tool contracts, model configuration, and MCP capabilities versioned, so that behavioral changes are attributable.
70. As a developer, I want deterministic behavior tests and separate model-backed evaluations, so that correctness and model quality are both measured.
71. As a developer, I want each vertical slice delivered test-first and kept usable, so that the end-to-end system evolves without a large unsafe rewrite.
72. As a developer, I want the existing hard-coded intent dispatcher removed after the discovery suite is green, so that there is one orchestration path.

## Implementation Decisions

- Preserve one external Commerce Agent interface. A caller supplies a conversation identifier and the new customer message; the module returns a typed Agent Outcome. This interface is the public behavior seam for callers and tests.
- Use two explicit model stages: an Intent Analyzer followed by a tool-using Commerce Agent. Use the same provider and model initially while keeping the modules independently replaceable.
- Define the Intent Brief as validated context rather than an immutable execution plan. It records the customer goal, constraints, known entities, missing information, confidence, and requested effects. The agent may refine understanding but may not expand permitted side effects.
- A deterministic capability resolver evaluates Intent Brief, original conversation, authenticated identities, conversation state, Cart state, checkout state, payment state, Brand configuration, and policy. The agent receives only tools permitted for that exact turn.
- Use the installed AI SDK tool-loop agent behind the Commerce Agent interface. Bound execution to five model/tool steps initially, with per-tool result limits, request timeout, and token budget.
- If the loop limit is reached, return the best grounded outcome or a focused clarification. Never invent a Product or continue silently.
- Keep model and SDK types out of trusted commerce modules. Catalog, Cart, checkout, policy, inventory, Ordering, and payment modules expose ordinary typed interfaces and adapters.
- Start discovery with two agent tools: bounded Catalog search and authoritative Product lookup. Keep pagination, filtering, retrieval ranking, and query mechanics inside the Catalog module; the deployment supplies the Brand boundary.
- Split discovery relevance between trusted retrieval and agent judgment. Catalog retrieval filters and coarsely ranks candidates; the agent evaluates candidates against the Intent Brief, may refine searches, and explains evidence-backed recommendations.
- Every Product presented or discussed must originate in current Catalog tool output. Product claims must map to returned name, description, category, price, availability, attributes, or Brand-curated Product Relations.
- Treat Catalog content and all tool results as untrusted data. They can supply facts but cannot grant authority or alter agent instructions.
- Normally present three to five Products. Refine automatically when constraints are sufficient, ask one focused question when a missing preference materially affects relevance, and do not fill the response with arbitrary matches.
- Persist ordered presentation artifacts linked to assistant messages. Resolve ordinal and conversational references against the latest relevant presentation before enabling a mutation.
- Make server-side conversation history the source of truth. The server creates and owns each conversation for an authenticated User; clients submit only the conversation identifier and new message.
- Persist append-only USER, ASSISTANT, TOOL, and SYSTEM messages. Build bounded model context from recent turns, active constraints, unresolved questions, authoritative Cart summary, recently presented Product IDs, and a compact older-history summary.
- Add conversation lifecycle, agent run identifiers, turn sequence, step ordering, tool-call identifiers, model/configuration provenance, timestamps, and direct trace relationships through forward schema migrations.
- Permit only one active run per conversation. Use sequence/version checks and return a retryable conflict for concurrent turns.
- Do not keep database transactions open across model, MCP, or other network calls. Persist state before an external call and reconcile afterward with short transactions, versions, and idempotency keys.
- Separate operational agent traces from business Audit Events. Traces record sanitized observable tool input/output, status, timing, run, and step. Audit Events record meaningful mutations, policy decisions, Approval, Order creation, and payment transitions.
- Never store private chain-of-thought. Store concise reasons, tool evidence, outcomes, and authoritative artifacts.
- Return a hybrid Agent Outcome. The model composes customer-facing language; trusted code supplies Intent Brief, Products, Cart summary, Checkout Proposal, payment artifacts, and trace summary.
- Support explicit COMPLETED, NEEDS_INPUT, TEMPORARILY_UNAVAILABLE, ACTION_CONFLICT, and PAYMENT_ACTION_REQUIRED outcomes. A clarification records its question and missing fields and resumes in the same conversation.
- Retry malformed intent output once. Ambiguous intent produces NEEDS_INPUT. Infrastructure failure produces a retryable system outcome. Missing or uncertain mutation intent never enables mutation tools.
- Allow anonymous Product discovery but require authenticated Customer identity for persistent Cart, Approval, Order, or payment actions. Exactly one Brand must be configured for the deployment and cannot be selected through routing, request data, or model input.
- Exclude guest purchasing from the initial end-to-end release.
- Add explicit PHYSICAL and DIGITAL Product fulfillment types. Implement physical commerce first and never infer fulfillment type from description text.
- Expose explicit Cart tools for reading the Cart, adding an item, setting an item quantity, removing an item, atomic batch changes, and undoing the latest eligible change.
- Require an explicit customer mutation request or an unambiguous affirmative response to a specific pending proposal. Preference or interest alone does not authorize a Cart mutation.
- Mutation tools operate on authoritative Product IDs. Ambiguous Product references produce NEEDS_INPUT rather than an autonomous choice.
- The server issues idempotency keys scoped to conversation, turn, and logical action. The model cannot invent them. Replays return the original Cart result.
- Cart update and removal require the expected Cart version. Conflicts refresh authoritative state and ask again when the intended final state is ambiguous.
- Multi-item Cart changes validate and apply atomically. Undo uses recorded before/after Cart versions and is allowed only without an intervening conflict.
- Cart tools accept Product identifiers, quantities, versions, and server-issued idempotency data only. Price, currency, availability, stock, ownership, and totals are loaded and calculated by trusted modules.
- “Checkout,” “buy,” and “pay” first prepare an immutable Checkout Proposal; they do not initiate payment directly.
- A Checkout Proposal snapshots Cart version, items, authoritative subtotal, discounts, shipping, tax, total, currency, warnings, policy decision, configuration versions, and expiry. Use a configurable five-to-fifteen-minute expiry initially.
- Collect and validate delivery addresses through structured UI. A trusted shipping module determines eligible shipping methods, charges, and estimates. A trusted pricing module determines discounts, tax, and grand total.
- Zero shipping or tax is acceptable for a demo only as explicit Brand configuration.
- Reserve inventory for an approval-ready Checkout Proposal, release it on expiry or rejection, and consume it after captured payment. If reservation is deferred, revalidate immediately before provider Order creation and document the oversell risk.
- Never silently accept price/stock changes, substitute Products, or reduce quantities. Material changes invalidate the proposal and require a new one.
- A deterministic policy module returns ALLOW, REQUIRE_APPROVAL, or BLOCK for the exact proposal and persists its inputs, decision, reasons, and version.
- Approval binds to one proposal identifier, exact amount, currency, Cart version, and expiry. A free-form affirmative is accepted only when exactly one active pending proposal is unambiguous.
- Any changed term invalidates Approval, even when the new amount is lower. Proposal and Approval may each create at most one immutable internal Order.
- Create the internal Order after validating and consuming Approval and immediately before provider payment initiation. Creation is idempotent by approved proposal.
- Use Razorpay MCP behind a narrow project-owned payment adapter. The Commerce Agent never receives the full MCP tool set, including capture, refund, settlement, payout, S2S payment, resend-OTP, or submit-OTP tools.
- Use the Razorpay-hosted remote MCP server initially over its current streamable HTTP endpoint. Keep deployment replaceable behind the adapter.
- Connect the Brand's test and live Payment Accounts with Razorpay OAuth Authorization Code flow and PKCE. Store encrypted tokens or secret-manager references, environment, status, and non-secret metadata. Allow raw API keys only for explicit non-production development.
- The agent supplies only an internal Order identifier to payment capability. Trusted code loads amount, currency, receipt, Brand Payment Account, Customer metadata, and constructs the Razorpay MCP request.
- Use the restricted MCP adapter to create and fetch Razorpay Orders. Use Razorpay Standard Checkout in the browser for payment method selection and customer authentication. Do not collect payment credentials or OTPs in conversation.
- Configure automatic capture and do not expose capture to the agent. Provider Order creation means payment is pending; authorization is not paid; captured payment is authoritative for PAID and fulfillment readiness.
- Verify the Standard Checkout response signature server-side for immediate feedback. Use verified webhooks as the durable state authority, supplemented by provider fetch for latency-sensitive reconciliation.
- Verify Razorpay webhooks from the raw request body, deduplicate provider event IDs, tolerate out-of-order delivery, and apply explicit monotonic payment state transitions.
- Derive a stable Razorpay receipt from the internal Order. Record outbound attempts before MCP calls, persist provider identifiers transactionally, and reconcile uncertain create results before retrying.
- If OAuth is expired or revoked, block new attempts and return PAYMENT_ACCOUNT_ACTION_REQUIRED without losing the internal Order. Only an authorized Brand Admin may reconnect the Payment Account.
- If MCP is unavailable after Approval, preserve the internal Order in payment-pending state, record failure, and offer a safe retry against the same logical receipt.
- Separate test and live Payment Accounts, secrets, webhook secrets, records, and visible environment indicators. Never fall back between environments.
- Allow cancellation before internal Order creation to reject the proposal and release reservations. Treat an unpaid provider Order as abandoned. Handle post-capture cancellation through a later refund workflow.
- Minimize personal data in model prompts and Razorpay requests. Never include credentials, OTPs, OAuth tokens, or unnecessary personal data.
- Record Intent Schema, agent-instruction, tool-contract, model/provider, and MCP capability versions on every run. Validate an explicit Razorpay tool allowlist and expected contracts; fail closed on hosted capability drift.
- Release capabilities behind deployment-environment flags for discovery, Cart mutations, checkout preparation, and Razorpay payment.
- Deliver six vertical slices: agentic discovery; multi-turn refinement and references; Cart operations; pricing/shipping/tax/inventory/Checkout Proposal/Approval; internal Order plus Razorpay Standard Checkout and reconciliation; production hardening and live rollout.
- Replace the hard-coded intent dispatcher after the discovery behavior suite is green. Keep rollback at configuration/deployment level rather than maintaining two orchestration implementations.
- Treat captured payment as the initial end-to-end terminal outcome. Persist fulfillment-ready Order data but defer operational fulfillment.

## Testing Decisions

- Follow test-driven development for every slice: confirm the public behavior, write one failing behavior test, implement only enough to pass, and refactor only while green.
- Use the Commerce Agent response interface as the highest and primary behavior seam. Tests supply a conversation identifier and message and assert the resulting outcome plus observable trusted effects.
- Avoid tests that assert internal prompts, private reasoning, exact model call counts when behavior does not require them, or the internal composition of the tool loop.
- Build deterministic fake adapters for model output, Catalog, conversation persistence, capability policy, Cart, checkout, Ordering, and payment. Accept dependencies rather than constructing them inside the Commerce Agent.
- Use existing Commerce Agent tests as prior art for natural-language behavior and trusted module effects, but replace interpreter-driven dispatch assertions with agent tool-choice and outcome behaviors.
- Use existing intent-interpreter tests as prior art for structured-output validation. Extend them for Intent Brief validity, malformed-output retry, ambiguity, requested effects, and price-bound invariants.
- Use existing agent route tests as prior art for request validation and response envelopes. Extend route behavior for server-created conversation identifiers, ownership checks, structured outcomes, conflicts, and retryable failures.
- Add behavior tests proving the agent can perform multiple Catalog searches, inspect Products, refine criteria, ask for input, stop on unsupported requests, and ground every presented Product in tool output.
- Add adversarial behavior tests proving Catalog content cannot inject instructions, client/model Brand selectors cannot alter the configured Catalog, and unavailable or fabricated Product claims are rejected.
- Test conversation behavior for append-only messages, bounded relevant history, ordered presentation artifacts, reference resolution, turn sequencing, and concurrent-run conflict.
- Test capability resolution deterministically for every intent, permission, identity, and commerce-state combination. Verify unauthorized tools are absent rather than prompt-disabled.
- Test Cart modules directly for explicit operations, authoritative values, quantity rules, Product ownership, stock, idempotent replay, optimistic conflicts, atomic batches, and undo eligibility.
- Test checkout and policy modules directly for authoritative totals, structured address/shipping behavior, tax, inventory reservation, proposal expiry, Cart invalidation, policy outcomes, Approval binding, and single consumption.
- Test Ordering directly for immutable snapshots, exact approved terms, unique proposal/Approval consumption, and idempotent retries.
- Contract-test the narrow Razorpay MCP adapter in test mode for allowed tools, expected schemas, amount construction from internal Orders, stable receipts, timeouts, OAuth failures, and fail-closed capability drift.
- Test Standard Checkout callback verification and webhook processing with valid and invalid signatures, raw bodies, duplicate IDs, out-of-order delivery, delayed capture, failure, and reconciliation.
- Test payment state transitions so provider creation remains pending, authorization remains authorized, only capture becomes paid, and retries preserve immutable attempt history.
- Maintain a separate versioned model-backed evaluation suite for paraphrased intent, relevance, clarification, tool choice, tool sequencing, prompt injection, stale state, duplicate actions, Approval enforcement, and denied payment access.
- Require behavior tests, domain invariant tests, adversarial evaluations, idempotency/concurrency coverage, sanitized traces, recovery behavior, a deployment-environment flag, and a disable path before enabling any mutation capability.
- Keep streaming outside the initial behavior seam. When added, test it as an adapter over the same outcomes and persisted progress rather than as a second orchestration path.

## Out of Scope

- Marketplaces, multiple Brands in one deployment, seller onboarding, shared
  cross-Brand Catalogs, Carts or Orders, and split payments.
- Refund creation, partial refunds, and agent-driven post-capture cancellation.
- Guest checkout and guest payment ownership.
- Saved payment methods, tokenized S2S payments, and all MCP OTP tools.
- Asking for or processing cards, CVVs, bank credentials, UPI credentials, or OTPs in conversation.
- Exposing the complete Razorpay MCP tool inventory to the Commerce Agent.
- Manual payment capture by the Commerce Agent.
- Payout, settlement, QR-code, Payment Link, and Brand finance operations.
- Autonomous Product substitution or quantity reduction during checkout.
- Carrying Approval across any changed Checkout Proposal term.
- Full shipping fulfillment, delivery tracking, returns, and warehouse operations after captured payment.
- Digital Product fulfillment in the first implementation sequence.
- Guest or anonymous Cart mutations.
- Initial response streaming; it will be added as an adapter after the non-streaming discovery slice.
- Persisting or exposing private model chain-of-thought.
- Retaining the current hard-coded intent dispatcher as a permanent fallback.

## Further Notes

- The repository already contains database schema foundations for conversations,
  messages, agent actions, Audit Events, Checkout Proposals, Approvals, Orders,
  payment attempts, and webhooks. These are strong drafts rather than immutable
  commitments; runtime repositories and forward migrations are still required.
- The current live flow is stateless and one-shot. It classifies structured
  retrieval or add-to-Cart intent, then application code dispatches Catalog or
  Cart operations.
- The current Cart supports adding only. Read, set quantity, remove, batch,
  idempotency, optimistic versioning at the interface, and undo behavior must be
  added incrementally.
- No runtime checkout, policy, inventory reservation, Ordering, Payment Account,
  Razorpay MCP, Standard Checkout callback, or webhook modules are currently
  wired.
- The Razorpay hosted MCP server can change independently and exposes a broad
  financial capability surface. The narrow adapter, allowlist, contract hash,
  and feature flags are mandatory safety mechanisms rather than optional
  hardening.
- “Proper agentic” means the model chooses and sequences permitted tools based on
  observations. It does not mean delegating authoritative commerce state
  transitions or payment authority to the model.
