import assert from "node:assert/strict";
import test from "node:test";
import {
  CartConflictError,
  CartError,
  withBoundedCartConflictRetry,
} from "./cart";

class PostgresError extends Error {
  constructor(readonly code: string) {
    super(`postgres error ${code}`);
    this.name = "PostgresError";
  }
}

/**
 * The shape the database driver actually raises: every query failure is wrapped,
 * and the Postgres error, with its code, is carried as the cause.
 */
class DriverQueryError extends Error {
  constructor(override readonly cause: PostgresError) {
    super("Failed query", { cause });
    this.name = "DrizzleQueryError";
  }
}

test("a transient Cart conflict is retried until the command is applied", async () => {
  let attempts = 0;

  const cart = await withBoundedCartConflictRetry(async () => {
    attempts += 1;
    if (attempts < 3) throw new PostgresError("40001");
    return { version: 4 };
  });

  assert.equal(attempts, 3);
  assert.deepEqual(cart, { version: 4 });
});

test("a deadlocked Cart command is retried within the bounded attempts", async () => {
  let attempts = 0;

  const cart = await withBoundedCartConflictRetry(async () => {
    attempts += 1;
    if (attempts < 2) throw new PostgresError("40P01");
    return { version: 2 };
  });

  assert.equal(attempts, 2);
  assert.deepEqual(cart, { version: 2 });
});

test("exhausted Cart conflict retries surface a typed conflict, not a database failure", async () => {
  let attempts = 0;

  await assert.rejects(
    withBoundedCartConflictRetry(async () => {
      attempts += 1;
      throw new PostgresError("40001");
    }),
    (error: unknown) => {
      assert.ok(error instanceof CartConflictError);
      assert.equal(error.code, "CART_CONFLICT");
      assert.equal(
        error.message,
        "The Cart changed too many times to apply this command. Reload the Cart and try again.",
      );
      return true;
    },
  );

  assert.equal(attempts, 3);
});

test("a Cart rule rejection is answered without retrying the command", async () => {
  let attempts = 0;

  await assert.rejects(
    withBoundedCartConflictRetry(async () => {
      attempts += 1;
      throw new CartError("Quiet Buds only has 4 units in stock.");
    }),
    (error: unknown) => {
      assert.ok(error instanceof CartError);
      assert.equal(error.code, "CART_RULE_REJECTED");
      return true;
    },
  );

  assert.equal(attempts, 1);
});

test("an unrelated failure is answered without retrying the command", async () => {
  let attempts = 0;

  await assert.rejects(
    withBoundedCartConflictRetry(async () => {
      attempts += 1;
      throw new Error("The Cart connection was lost.");
    }),
    { message: "The Cart connection was lost." },
  );

  assert.equal(attempts, 1);
});

test("a transient conflict reported by the database driver is retried", async () => {
  let attempts = 0;

  const cart = await withBoundedCartConflictRetry(async () => {
    attempts += 1;
    if (attempts < 2) throw new DriverQueryError(new PostgresError("40001"));
    return { version: 3 };
  });

  assert.equal(attempts, 2);
  assert.deepEqual(cart, { version: 3 });
});

test("a driver-reported conflict that never clears becomes a typed conflict", async () => {
  let attempts = 0;

  await assert.rejects(
    withBoundedCartConflictRetry(async () => {
      attempts += 1;
      throw new DriverQueryError(new PostgresError("23505"));
    }),
    (error: unknown) => {
      assert.ok(error instanceof CartConflictError);
      assert.equal(error.code, "CART_CONFLICT");
      return true;
    },
  );

  assert.equal(attempts, 3);
});

test("a Cart rule rejection carried by the driver is never retried", async () => {
  let attempts = 0;

  await assert.rejects(
    withBoundedCartConflictRetry(async () => {
      attempts += 1;
      throw new Error("Failed query", {
        cause: new CartError("Quiet Buds only has 4 units in stock."),
      });
    }),
    { message: "Failed query" },
  );

  assert.equal(attempts, 1);
});
