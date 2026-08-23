import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "./route";

test("product detail treats an invalid product ID as not found", async () => {
  const response = await GET(new Request("http://localhost/api/products/nope"), {
    params: Promise.resolve({ productId: "nope" }),
  });

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    error: {
      code: "PRODUCT_NOT_FOUND",
      message: "The requested product was not found.",
      details: {},
    },
  });
});
