import assert from "node:assert/strict";
import test from "node:test";

import { categoryBlockColor } from "./category-block";

test("a category keeps one colour across Conversation Turns", () => {
  assert.equal(
    categoryBlockColor("Footwear"),
    categoryBlockColor("Footwear"),
  );
});

test("a category's colour ignores the casing and spacing the Catalog stored", () => {
  assert.equal(categoryBlockColor("Footwear"), categoryBlockColor("  footwear "));
});

test("every colour is one the Brand's theme declares", () => {
  const declared = new Set([
    "bg-chart-1",
    "bg-chart-2",
    "bg-chart-3",
    "bg-chart-4",
    "bg-chart-5",
  ]);
  const categories = [
    "Footwear",
    "Audio",
    "Accessories",
    "Bags",
    "Apparel",
    "Outdoor",
    "",
  ];

  for (const category of categories) {
    assert.ok(
      declared.has(categoryBlockColor(category)),
      `${category || "(unnamed)"} took ${categoryBlockColor(category)}`,
    );
  }
});

test("a Recommendation Set of mixed categories is visually navigable", () => {
  const shortlist = ["Footwear", "Audio", "Accessories", "Bags", "Apparel"];
  const colors = new Set(shortlist.map(categoryBlockColor));

  assert.ok(
    colors.size >= 4,
    `five categories collapsed to ${colors.size} colours`,
  );
});
