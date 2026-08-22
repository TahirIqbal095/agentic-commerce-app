# Agentic Commerce

This context describes a merchant storefront where customers and an AI shopping assistant use the same trusted commerce rules. The assistant may propose actions, while authoritative commerce modules control products, totals, authorization, orders, and payments.

## People and ownership

**User**:
A person with one identity who may shop as a customer and may administer any merchant that has granted them access.
_Avoid_: Account, Customer, Merchant Admin

**Merchant**:
The business that owns a catalog, policies, carts, orders, and audit history.
_Avoid_: Store, seller account

**Customer**:
A user who browses products, owns a cart, authorizes checkout, and places orders.
_Avoid_: Buyer, shopper account

**Merchant Admin**:
A user authorized through a merchant-specific membership to manage that merchant's catalog, policies, approvals, and operational data.
_Avoid_: Merchant, administrator account

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

## Checkout and authorization

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
