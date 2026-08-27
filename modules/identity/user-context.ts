import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema/identity";
import { isUuid } from "@/lib/validation";

export type UserContext = {
  userId: string;
};

export async function resolveUserContext(): Promise<UserContext> {
  const configuredUserId = process.env.USER_ID;

  if (configuredUserId) {
    if (!isUuid(configuredUserId)) throw new Error("USER_ID must be a UUID");

    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, configuredUserId))
      .limit(1);

    if (!user) throw new Error("The configured USER_ID does not exist");
    return { userId: user.id };
  }

  const availableUsers = await db
    .select({ id: users.id })
    .from(users)
    .orderBy(asc(users.id))
    .limit(2);

  if (availableUsers.length !== 1) {
    throw new Error(
      "USER_ID is required unless the database contains exactly one User",
    );
  }

  return { userId: availableUsers[0].id };
}
