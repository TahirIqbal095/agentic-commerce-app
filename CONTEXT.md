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
reserve Product inventory. Creating an Order converts that Cart into read-only
history; a later selection starts a new active Cart.
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
A retry-safe attempt to collect the amount of one Order through a payment
provider.
_Avoid_: Payment, transaction

**Provider Order**:
Razorpay's payment collection record associated with an internal Payment
Attempt.
_Avoid_: Order

**Audit Event**:
An immutable fact describing a meaningful action, decision, state change, or
external notification.
_Avoid_: Log line, activity
