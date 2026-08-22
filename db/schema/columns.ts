import { bigint, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const id = () => uuid("id").primaryKey().defaultRandom();

export const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const money = (name: string) =>
  bigint(name, { mode: "number" }).notNull();

export const currency = () => varchar("currency", { length: 3 }).notNull();
