import assert from "node:assert/strict";
import test from "node:test";
import { createBrandReader, type BrandIdentity } from "./brand";

const BRAND: BrandIdentity = {
  id: "51000000-0000-4000-8000-000000000001",
  name: "Northlight",
  slug: "northlight",
  description: "A running Brand.",
  logoUrl: null,
  currency: "INR",
};

test("the Brand is read once however many Conversation Turns ask for it", async () => {
  let reads = 0;
  const requireBrand = createBrandReader(async () => {
    reads += 1;
    return BRAND;
  });

  assert.deepEqual(
    await Promise.all([requireBrand(), requireBrand(), requireBrand()]),
    [BRAND, BRAND, BRAND],
  );
  assert.deepEqual(await requireBrand(), BRAND);
  assert.equal(reads, 1);
});

test("a failed Brand read is retried rather than remembered", async () => {
  let reads = 0;
  const requireBrand = createBrandReader(async () => {
    reads += 1;
    if (reads === 1) throw new Error("The Brand is unavailable.");
    return BRAND;
  });

  await assert.rejects(requireBrand());
  assert.deepEqual(await requireBrand(), BRAND);
  assert.equal(reads, 2);
});
