# Agentic Commerce

This context describes one Brand's agentic commerce Storefront. The Commerce
Agent helps Customers discover the Brand's Products and complete purchases,
while authoritative commerce rules control Products, totals, authorization,
Orders, and payments.

## People and ownership

**User**:
A person with one identity who may shop as a Customer or administer the Brand.
_Avoid_: Account, Customer account, Merchant

**Brand**:
The business that owns the Storefront, Catalog, policies, Orders, Payment
Accounts, and audit history. Each deployment serves exactly one Brand.
_Avoid_: Merchant, seller, vendor, tenant

**Storefront**:
The Brand's customer-facing shop where Products are discovered and purchased.
_Avoid_: Marketplace, platform, store

**Customer**:
A User who browses Products, owns a Cart, authorizes checkout, and places Orders.
_Avoid_: Buyer, shopper account

**Brand Admin**:
A User authorized to operate the Brand's Catalog, payment configuration,
policies, and operational data.
_Avoid_: Merchant Admin, seller, tenant administrator

## Catalog and shopping

**Catalog**:
The Brand's authoritative collection of Products offered through the
Storefront.
_Avoid_: Marketplace inventory, seller listings

**Product**:
A Brand-owned item offered for sale, with an authoritative base price and
inventory state.
_Avoid_: Listing, catalog item

**Product Relation**:
A Brand-curated relationship between two Products used to produce cross-sell,
upsell, accessory, bundle, alternative, or compatibility candidates.
_Avoid_: Recommendation

**Cart**:
A Customer's selection of the Brand's Products before an Order is created. An
active Cart is mutable, persists independently of Conversations, and does not
reserve Product inventory. A confirmed captured payment converts that Cart into
read-only history, and a later selection starts a new active Cart. An Order that
is never paid — dismissed, declined, or exhausted — leaves its Cart active and
unchanged, so nothing is lost by a payment that did not happen.
_Avoid_: Basket, draft order

**Cart Item**:
A Product selected in a Cart, together with its positive whole-unit quantity
and Cart Price. It remains visible when the Product's current price or
availability changes.
_Avoid_: Line item, cart line

**Cart Item Removal**:
The explicit removal of one Cart Item from a Cart. Setting a Cart Item's
quantity to zero is invalid and does not mean removal.
_Avoid_: Product deletion, zero quantity

**Cart Quantity Change**:
An authoritative change that replaces a Cart Item's quantity with another
positive whole-unit quantity. It may be requested conversationally or through
controls on the current Cart summary.
_Avoid_: Cart Item Removal, Product quantity

**Cart Mutation**:
An authoritative addition, Cart Item Removal, Cart Quantity Change, or clearing
of a Cart. Multiple Cart Mutations requested in one Conversation Turn succeed
or fail together.
_Avoid_: Cart edit, optimistic update

**Cart Price**:
The unit price shown for a Cart Item, retained until the Cart is authoritatively
repriced. Adding the same Product again reprices the entire Cart Item; a
difference from the Product's current base price is disclosed.
_Avoid_: Current price, final price

**Cart Subtotal**:
The sum of each Cart Item's quantity multiplied by its Cart Price, before any
tax, shipping, discounts, or final checkout pricing.
_Avoid_: Accumulated total, final total

**Cart Summary**:
A Customer-visible snapshot of authoritative Cart state at one point in a
Conversation. Only the most recent Cart Summary is current and interactive;
earlier Cart Summaries remain visible as read-only history.
_Avoid_: Live Cart, checkout summary

**Recommendation**:
A Product suggestion shown in the context of a Customer's intent or Cart,
whose presentation and acceptance can be measured.
_Avoid_: Product Relation

**Recommendation Set**:
An ordered group of Recommendations produced by one Conversation Turn. The
most recent Recommendation Set is the default target of follow-up references;
such a reference identifies a Product but does not preserve its price or stock.
_Avoid_: Search results, Product list

**Commerce Agent**:
The conversational shopping participant that interprets Customer needs,
searches the Catalog, recommends Products, changes the Cart, and prepares
checkout through trusted commerce rules.
_Avoid_: Autonomous buyer, payment authority

**Conversation**:
An ongoing exchange between a Customer and the Commerce Agent that can resume
across devices. Each Customer has at most one current Conversation; starting a
new one removes the previous Conversation from Customer access while leaving
the Cart and protected commerce records unchanged.
_Avoid_: Chat session, request

**Conversation Turn**:
One Customer message or interactive Cart command and the response it produces
within a Conversation. Interactive Cart commands use deterministic commerce
rules and do not require model interpretation.
_Avoid_: Request, prompt

**Conversation Context**:
The accumulated Customer shopping intent and prior Recommendations retained
across Conversation Turns so follow-up references can be understood.
_Avoid_: Memory, chat history

**Intent Brief**:
The Storefront's own resolved statement of what a Customer is asking for in one
Conversation Turn: their goal, the active Product constraints, the Products
they referred to, what they have not said, and which effects the Turn should
present. It is context handed to the Commerce Agent, never an execution plan,
and it authorizes nothing.
_Avoid_: Prompt, plan, query

**Turn Budget**:
The bounded time, steps, and tokens one Conversation Turn may spend. Exhausting
it is a shortfall of the Storefront, described to the Customer as the
Storefront having been slow, and it says nothing about how the Customer
phrased their request.
_Avoid_: Missing Information, unclear request, timeout

**Missing Information**:
What a Customer has not yet said that materially prevents a useful answer. It
is the only ground on which the Storefront may ask a Customer for more, and it
is never inferred from an exhausted Turn Budget.
_Avoid_: Turn Budget, vague request

**Context Summary**:
The Customer-visible view of the active Product constraints in Conversation
Context, from which individual constraints can be removed to produce a new
Recommendation Set.
_Avoid_: Filters, model context

**Conversation Transcript**:
The Customer-visible record of Conversation Turns, retained separately from
the privacy-minimized Conversation Context used by the Commerce Agent. Durable
Transcripts redact recognized secrets and unnecessary personal data.
_Avoid_: Model context, memory

## Checkout and authorization

**Conversational Checkout**:
A checkout experience in which the Commerce Agent helps a Customer shape a
Cart, prepares an exact purchase for explicit Approval, and initiates payment
after Approval.
_Avoid_: Autonomous purchase, chat payment

**Checkout Proposal**:
An immutable commercial summary of a Cart, including final Product prices,
totals, stock warnings, and the Policy Evaluation at preparation time.
Changing that Cart invalidates any unconsumed Checkout Proposal prepared from
its earlier state.
_Avoid_: Checkout, quote, payment request

**Policy Evaluation**:
The recorded result of applying Brand policy to a proposed action: allow,
require Approval, or block.
_Avoid_: Validation, permission check

**Approval**:
A Customer's explicit, expiring authorization for one exact Checkout Proposal
and amount.
_Avoid_: Confirmation, consent flag

## Ordering and payment

**Payment Account**:
The Brand's configured account with a payment provider, through which Customer
payments are collected. Test and live Payment Accounts are isolated.
_Avoid_: Payment wall, paywall

**Order**:
The durable, immutable commercial record created from an approved Checkout
Proposal before external payment begins.
_Avoid_: Purchase, Razorpay order

**Payment Attempt**:
One explicit presentation of provider checkout for a Provider Order, which may
be dismissed or produce one Provider Payment.
_Avoid_: Provider Operation, Payment, transaction

**Provider Operation**:
A durable, retry-safe logical execution of one Provider Write, identified
independently from its transport attempts and provider result.
_Avoid_: Payment Attempt, MCP request

**Provider Write**:
A request through a Payment Account that changes payment-provider state, such
as creating a Provider Order or initiating a Payment Action.
_Avoid_: MCP tool call, money action

**Payment Action**:
A Provider Write that can authorize, collect, or return Customer funds.
_Avoid_: Transaction, money action

**Unknown Provider Outcome**:
The state in which a dispatched Provider Write has no confirmed result, so the
Storefront must reconcile provider state before treating it as applied or
retrying it as absent.
_Avoid_: Failed request, Provider failure

**Provider Order**:
Razorpay's payment collection record for one internal Order. An Order has at
most one Provider Order, against which multiple Payment Attempts may occur.
_Avoid_: Order

**Provider Payment**:
Razorpay's record of one attempt to authorize and collect funds against a
Provider Order.
_Avoid_: Payment Attempt, Order, transaction

**Audit Event**:
An immutable fact describing a meaningful action, decision, state change, or
external notification.
_Avoid_: Log line, activity

**Checkout Timeline**:
The Customer-visible, privacy-safe projection of Audit Events for one
Conversational Checkout, expressed as outcomes and explanations rather than
provider payloads or internal traces.
_Avoid_: Audit log, debug log

**Provider Notification**:
An authenticated, deduplicated fact delivered asynchronously by a payment
provider and retained until it can be associated with protected commerce
records.
_Avoid_: Webhook request, callback
