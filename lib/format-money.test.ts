import assert from "node:assert/strict";
import test from "node:test";
import { formatMoney } from "./format-money";

test("formats authoritative minor-unit prices for display", () => {
  assert.equal(formatMoney(449900, "INR"), "₹4,499");
});
