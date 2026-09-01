import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  pgTable,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { carts } from "./cart";
import { products } from "./catalog";
import { id, money } from "./columns";
import { productRelationTypeEnum } from "./enums";
import { guestSessions } from "./identity";

export const recommendationEvents = pgTable(
  "recommendation_events",
  {
    id: id(),
    guestSessionId: uuid("guest_session_id")
      .notNull()
      .references(() => guestSessions.id, { onDelete: "cascade" }),
    cartId: uuid("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "restrict" }),
    sourceProductId: uuid("source_product_id").references(() => products.id, {
      onDelete: "restrict",
    }),
    recommendedProductId: uuid("recommended_product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    recommendationType: productRelationTypeEnum("recommendation_type").notNull(),
    cartValueBeforeMinor: money("cart_value_before_minor"),
    projectedCartValueMinor: money("projected_cart_value_minor"),
    incrementalRevenueMinor: bigint("incremental_revenue_minor", {
      mode: "number",
    }),
    shownAt: timestamp("shown_at", { withTimezone: true }).notNull().defaultNow(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  },
  (table) => [
    index("recommendation_events_cart_idx").on(table.cartId, table.shownAt),
    check(
      "recommendation_events_values_nonnegative",
      sql`${table.cartValueBeforeMinor} >= 0 and ${table.projectedCartValueMinor} >= 0 and (${table.incrementalRevenueMinor} is null or ${table.incrementalRevenueMinor} >= 0)`,
    ),
    check(
      "recommendation_events_one_resolution",
      sql`not (${table.acceptedAt} is not null and ${table.rejectedAt} is not null)`,
    ),
  ],
);
