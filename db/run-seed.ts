import { db } from "@/db";
import { seedDemoCatalog } from "@/db/seed";

async function main(): Promise<void> {
  try {
    await seedDemoCatalog();
    console.log("Demo merchant and catalog seeded.");
  } catch (error) {
    console.error("Failed to seed demo catalog.", error);
    process.exitCode = 1;
  } finally {
    await db.$client.end();
  }
}

void main();
