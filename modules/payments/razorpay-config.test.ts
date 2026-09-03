import assert from "node:assert/strict";
import test from "node:test";
import { readRazorpayTestConfiguration } from "./razorpay-config";

const validEnvironment = {
  RAZORPAY_TEST_KEY_ID: "rzp_test_examplekey",
  RAZORPAY_TEST_KEY_SECRET: "test-secret-value",
  RAZORPAY_WEBHOOK_SECRET: "webhook-secret-value",
};

test("complete Test Mode credentials enable checkout", () => {
  const configuration = readRazorpayTestConfiguration(validEnvironment);

  assert.equal(configuration.status, "ENABLED");
  assert.equal(
    configuration.status === "ENABLED" && configuration.keyId,
    "rzp_test_examplekey",
  );
  assert.equal(
    configuration.status === "ENABLED" && configuration.environmentMode,
    "TEST",
  );
});

test("a live key ID disables checkout so no real-money call can be made", () => {
  const configuration = readRazorpayTestConfiguration({
    ...validEnvironment,
    RAZORPAY_TEST_KEY_ID: "rzp_live_realkey",
  });

  assert.equal(configuration.status, "DISABLED");
  assert.equal(
    configuration.status === "DISABLED" && configuration.reasonCode,
    "RAZORPAY_KEY_NOT_TEST_MODE",
  );
});

test("absent credentials disable only checkout, and explain themselves", () => {
  const configuration = readRazorpayTestConfiguration({});

  assert.equal(configuration.status, "DISABLED");
  assert.equal(
    configuration.status === "DISABLED" && configuration.reasonCode,
    "RAZORPAY_CREDENTIALS_ABSENT",
  );
  assert.match(
    configuration.status === "DISABLED" ? configuration.explanation : "",
    /Test Mode/,
  );
});

test("a webhook secret that repeats the API secret is refused as indistinct", () => {
  const configuration = readRazorpayTestConfiguration({
    ...validEnvironment,
    RAZORPAY_WEBHOOK_SECRET: validEnvironment.RAZORPAY_TEST_KEY_SECRET,
  });

  assert.equal(configuration.status, "DISABLED");
  assert.equal(
    configuration.status === "DISABLED" && configuration.reasonCode,
    "RAZORPAY_SECRETS_NOT_DISTINCT",
  );
});

test("no credential is ever repeated in a Customer-safe explanation", () => {
  for (const environment of [
    {},
    { ...validEnvironment, RAZORPAY_TEST_KEY_ID: "rzp_live_realkey" },
    { ...validEnvironment, RAZORPAY_TEST_KEY_SECRET: "" },
  ]) {
    const configuration = readRazorpayTestConfiguration(environment);
    const explanation =
      configuration.status === "DISABLED" ? configuration.explanation : "";
    assert.doesNotMatch(explanation, /test-secret-value|webhook-secret-value/);
  }
});

test("the Basic authorization value is derived on demand and never stored", () => {
  const configuration = readRazorpayTestConfiguration(validEnvironment);
  assert.equal(configuration.status, "ENABLED");
  if (configuration.status !== "ENABLED") return;

  assert.equal(
    JSON.stringify(configuration).includes("test-secret-value"),
    false,
  );
  assert.equal(
    configuration.basicAuthorization(),
    `Basic ${Buffer.from("rzp_test_examplekey:test-secret-value").toString("base64")}`,
  );
});
