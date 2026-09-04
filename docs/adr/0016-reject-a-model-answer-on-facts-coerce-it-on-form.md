# Reject a model answer on facts, coerce it on form

The Commerce Agent's structured-output validator splits along one line.
Deviations of *presentation* are normalised into a valid Agent Outcome: a
refinement question attached to a `COMPLETED` answer is dropped, absent
optional fields default, extra keys are stripped, and values past a length or
cardinality cap are trimmed. Deviations of *fact* still fail the whole answer:
a Product ID that is not a well-formed identifier is refused outright, and the
Commerce Agent may still only describe Products it read through a Catalog tool.
Whatever the validator lets through, a Product ID absent from the Agent's
observed-Product set is never presented.

The validator previously rejected any `COMPLETED` answer carrying a non-null
`question`. Gemini attaches a follow-up question to completed answers as a
matter of habit, so a correct answer naming five real Products was thrown away
on that predicate alone. Rejection raised `NoObjectGeneratedError`, the AI SDK
retried, the loop re-issued the identical Catalog search, and the Turn ended at
the limit path with no Products and the sentence "Could you narrow the Product
type or try the search again?" — advice that could not help, addressed to the
one participant with nothing wrong.

Alternatives rejected:

- **Prompting the model not to attach a question.** The failure would return
  with the next model, the next provider, or the next prompt edit, and it fails
  closed onto the Customer.
- **Routing a completed answer with a question through the needs-input
  outcome.** That outcome's rendering suppresses the Context Summary, so a
  successful discovery would silently lose the Customer's own constraint chips.
  Presenting a refinement alongside a Recommendation Set needs its own field on
  the completed outcome, and is not done here.
- **Dropping structured output entirely.** It converged in a single search
  during investigation, but it also drops the grounding check that keeps the
  Agent from naming a Product it never read. Speed is not bought with accuracy.
- **Relaxing the JSON Schema instead.** Removing `format: uuid`,
  `additionalProperties: false`, or the required-field list did not reproduce
  the failure. Only the custom validator predicate did.

A Turn that produces nothing usable — a cut-short, unavailable, or ungrounded
Commerce Agent — now answers from a deterministic Catalog search dispatched
alongside the Agent, and attributes the shortfall to the Storefront. Those
speculative Products are held apart from the Agent's observed-Product set, so
the fallback cannot be used to launder a Product the Agent never read.

The shortfall is attributed precisely. A Turn says it ran long only when its
Turn Budget actually ran out; a Turn whose Commerce Agent was unavailable, or
whose answer could not be trusted, says it could not finish. The two are kept
apart for the same reason the Customer is never blamed: this issue exists
because the Storefront told a Customer something untrue about why their Turn
failed, and replacing that with a different untruth would not be a fix.

Time budgets, measured against the configured Supabase pooler and the Gemini
Developer API during the investigation that produced this decision:

- The Commerce Agent loop rises from 15s to **20s**. A healthy discovery Turn
  spends two model calls; runs against the broken contract took 14–37s, and
  15s cut a sound answer off often enough to look like a search-quality
  problem.
- The Intent Brief analysis was unbounded and was observed at 69s. It gains a
  **15s** budget covering its one retry, against 8.5–9.6s for the same call on
  `gemini-3.1-flash-lite`.
- Both budgets are the Storefront's own: the provider is asked to stop, and the
  Turn stops waiting whether or not it does.

The default model moves off `gemini-3.5-flash-lite`, which returned repeated
`503 UNAVAILABLE` and 69–71s successes throughout the investigation, to
`gemini-3.1-flash-lite`, and is read from configuration in one place so a
degraded model can be swapped without a deploy.

Two database round trips per Turn are removed: the Brand row, which cannot
change within a deployment, is read once per process, and the Guest Session
read and refresh become one statement. Measured cost per Turn was ~180ms per
round trip, ~540ms per transaction, and 17–20 round trips on a first Turn. The
conversation persistence transactions are deliberately left alone — they carry
the optimistic-concurrency revision checks, and their round trips are not worth
trading for correctness risk.
