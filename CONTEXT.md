# Agentic Commerce

This context describes an agentic commerce platform where each merchant makes a catalog and payment account available to a conversational commerce agent. The agent helps customers discover products and complete purchases, while authoritative commerce rules control products, totals, authorization, orders, and payments.

## People and ownership

**User**:
A person with one identity who may shop as a customer or operate a merchant's storefront.
_Avoid_: Account, Customer, Merchant Admin

**Merchant**:
A business that owns a storefront, catalog, policies, orders, payment account, and audit history.
_Avoid_: Store, seller account

**Storefront**:
The merchant's customer-facing shop where products are discovered and purchased.
_Avoid_: Marketplace, platform

**Customer**:
A user who browses products, owns a cart, authorizes checkout, and places orders.
_Avoid_: Buyer, shopper account

**Merchant Admin**:
A user authorized to operate the merchant's catalog, payment configuration, policies, and operational data.
_Avoid_: Seller, tenant administrator

## Catalog and shopping

**Product**:
A merchant-owned item offered for sale, with an authoritative base price and inventory state.
_Avoid_: Listing, catalog item

**Product Relation**:
A merchant-curated relationship between two products used to generate cross-sell, upsell, accessory, bundle, alternative, or compatibility candidates.
_Avoid_: Recommendation

**Cart**:
A customer's mutable selection of products for one merchant before an order is created.
_Avoid_: Basket, draft order

**Recommendation**:
A product suggestion shown in the context of a customer's intent or cart, whose presentation and acceptance can be measured.
_Avoid_: Product relation

**Commerce Agent**:
The conversational shopping participant that interprets customer needs, searches a merchant's catalog, recommends products, changes the cart, and prepares checkout through trusted commerce rules.
_Avoid_: Autonomous buyer, payment authority

## Checkout and authorization

**Conversational Checkout**:
A checkout experience in which the Commerce Agent helps a customer shape a cart, prepares an exact purchase for explicit approval, and initiates payment after approval.
_Avoid_: Autonomous purchase, chat payment

**Checkout Proposal**:
An immutable commercial summary of a cart, including final item prices, totals, stock warnings, and the policy decision at preparation time.
_Avoid_: Checkout, quote, payment request

**Policy Evaluation**:
The recorded result of applying a merchant policy to a proposed action: allow, require approval, or block.
_Avoid_: Validation, permission check

**Approval**:
A customer's explicit, expiring authorization for one exact checkout proposal and amount.
_Avoid_: Confirmation, consent flag

## Ordering and payment

**Payment Account**:
The merchant's configured account with a payment provider, through which customer payments are collected for the merchant.
_Avoid_: Payment wall, paywall

**Order**:
The durable, immutable commercial record created from an approved checkout proposal before external payment begins.
_Avoid_: Purchase, Razorpay order

**Payment Attempt**:
A retry-safe attempt to collect the amount of one order through a payment provider.
_Avoid_: Payment, transaction

**Provider Order**:
Razorpay's payment collection record associated with an internal payment attempt.
_Avoid_: Order

**Audit Event**:
An immutable fact describing a meaningful action, decision, state change, or external notification.
_Avoid_: Log line, activity
