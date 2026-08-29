import assert from "node:assert/strict";
import test from "node:test";
import { parseProductSearchQuery } from "./catalog-query";

test("uses the documented pagination defaults", () => {
  assert.deepEqual(parseProductSearchQuery(new URLSearchParams()), {
    ok: true,
    value: { limit: 20 },
  });
});

test("parses all supported product filters", () => {
  const params = new URLSearchParams({
    query: "  headphones  ",
    category: "  audio  ",
    minPriceMinor: "100",
    maxPriceMinor: "5000",
    attributes: JSON.stringify({ color: "black", wireless: true }),
    cursor: "123e4567-e89b-42d3-a456-426614174000",
    limit: "50",
  });

  assert.deepEqual(parseProductSearchQuery(params), {
    ok: true,
    value: {
      query: "headphones",
      category: "audio",
      minPriceMinor: 100,
      maxPriceMinor: 5000,
      attributes: { color: "black", wireless: true },
      cursor: "123e4567-e89b-42d3-a456-426614174000",
      limit: 50,
    },
  });
});

test("rejects invalid limits and price ranges", () => {
  const invalidLimit = parseProductSearchQuery(
    new URLSearchParams({ limit: "51" }),
  );
  assert.equal(invalidLimit.ok, false);

  const invalidRange = parseProductSearchQuery(
    new URLSearchParams({ minPriceMinor: "200", maxPriceMinor: "100" }),
  );
  assert.equal(invalidRange.ok, false);
});

test("rejects malformed attributes, cursors, and unknown parameters", () => {
  for (const params of [
    new URLSearchParams({ attributes: "[]" }),
    new URLSearchParams({ cursor: "not-a-cursor" }),
    new URLSearchParams({ brandId: crypto.randomUUID() }),
  ]) {
    assert.equal(parseProductSearchQuery(params).ok, false);
  }
});
