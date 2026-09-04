import assert from "node:assert/strict";
import test from "node:test";
import { createCheckoutFaultInjector } from "./checkout-fault";

const ARMED = { NODE_ENV: "test", CHECKOUT_FAULT: "LOSE_CREATE_ORDER_RESPONSE" };

test("the fault is disarmed unless the environment names it exactly", () => {
  for (const environment of [
    {},
    { NODE_ENV: "test" },
    { NODE_ENV: "test", CHECKOUT_FAULT: "" },
    { NODE_ENV: "test", CHECKOUT_FAULT: "lose_create_order_response" },
    { NODE_ENV: "test", CHECKOUT_FAULT: "LOSE_CREATE_ORDER_RESPONSE " },
    { NODE_ENV: "development", CHECKOUT_FAULT: "true" },
  ]) {
    assert.equal(
      createCheckoutFaultInjector(environment),
      undefined,
      `${JSON.stringify(environment)} must not arm the fault`,
    );
  }
});

test("a production build cannot arm the fault however it is configured", () => {
  assert.equal(
    createCheckoutFaultInjector({ ...ARMED, NODE_ENV: "production" }),
    undefined,
  );
});

test("an armed fault loses exactly one response and no more", () => {
  const loseNextWriteResponse = createCheckoutFaultInjector(ARMED);

  assert.ok(loseNextWriteResponse);
  assert.equal(loseNextWriteResponse(), true);
  assert.equal(loseNextWriteResponse(), false);
  assert.equal(loseNextWriteResponse(), false);
});

test("each armed checkout gets its own single loss, never a shared one", () => {
  const first = createCheckoutFaultInjector(ARMED);
  const second = createCheckoutFaultInjector(ARMED);

  assert.ok(first);
  assert.ok(second);
  assert.equal(first(), true);
  assert.equal(second(), true);
});
