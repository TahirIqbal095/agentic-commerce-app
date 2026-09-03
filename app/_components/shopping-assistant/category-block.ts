/**
 * The chart tokens the Brand's theme declares, in order.
 *
 * A Product carries no imagery and the Catalog has no field for one, so a
 * Recommendation card's visual block is permanent furniture rather than a
 * placeholder. Drawing it from the theme means the block is part of the Brand's
 * identity instead of decoration invented by the Storefront.
 */
const CATEGORY_BLOCK_COLORS = [
  "bg-chart-1",
  "bg-chart-2",
  "bg-chart-3",
  "bg-chart-4",
  "bg-chart-5",
] as const;

/**
 * Picks one category's colour block.
 *
 * The choice is a stable hash of the category rather than a position in the
 * Recommendation Set, so a category keeps the same colour across Conversation
 * Turns and shortlists stay comparable.
 *
 * @param category - The Product's category.
 * @returns The Tailwind background class for that category's block.
 */
export function categoryBlockColor(category: string): string {
  let hash = 0;
  for (const character of category.trim().toLowerCase()) {
    hash = (hash * 31 + character.charCodeAt(0)) % 1_000_003;
  }
  return CATEGORY_BLOCK_COLORS[hash % CATEGORY_BLOCK_COLORS.length];
}
