import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema/identity";
import { isUuid } from "@/lib/validation";

export type CustomerContext = {
  customerId: string;
};

export async function resolveCustomerContext(): Promise<CustomerContext> {
  const configuredCustomerId = process.env.CUSTOMER_ID;

  if (configuredCustomerId) {
    if (!isUuid(configuredCustomerId)) {
      throw new Error("CUSTOMER_ID must be a UUID");
    }

    const [customer] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, configuredCustomerId))
      .limit(1);

    if (!customer) {
      throw new Error("The configured CUSTOMER_ID does not exist");
    }

    return { customerId: customer.id };
  }

  const availableCustomers = await db
    .select({ id: users.id })
    .from(users)
    .orderBy(asc(users.id))
    .limit(2);

  if (availableCustomers.length !== 1) {
    throw new Error(
      "CUSTOMER_ID is required unless the database contains exactly one customer",
    );
  }

  return { customerId: availableCustomers[0].id };
}
