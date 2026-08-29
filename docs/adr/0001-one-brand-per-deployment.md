# 0001 — One Brand per deployment

Status: accepted

## Context

The repository described a Storefront rather than a Marketplace, but its
runtime and persistence model selected and isolated multiple Merchants. That
made the product language and the implemented architecture disagree.

The application is pre-production, so this boundary can be corrected without
maintaining compatibility with deployed multi-tenant data or APIs.

## Decision

Each application deployment and database serve exactly one Brand and one
customer-facing Storefront. A singleton Brand record holds the Brand's identity
and configuration. Brand ownership is implicit for ordinary commerce records;
Customers cannot select a Brand through routing, request data, or model input.

Deploying a Storefront for another Brand requires a separate deployment and
database. Brand Admin authorization remains explicit. Test and live Payment
Accounts remain isolated.

## Consequences

- Merchant selection, `MERCHANT_ID`, and cross-Merchant scoping are removed.
- Repeated Merchant ownership keys are removed from commerce records.
- Customer ownership and authorization boundaries remain mandatory.
- Capability rollout is configured per deployment and environment.
- Marketplaces, seller onboarding, shared catalogs, cross-Brand Carts and
  Orders, payment splitting, and multiple Brands in one deployment are outside
  this application's scope.
