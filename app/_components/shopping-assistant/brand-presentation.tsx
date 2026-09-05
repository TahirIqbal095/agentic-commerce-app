/**
 * The Storefront's only Brand-specific presentation.
 *
 * Everything structural the Storefront says comes from data: what the Brand
 * sells comes from the Brand record, and what the Catalog holds comes from the
 * Catalog. Two things cannot be derived from either, and they live here
 * together so a deployment for another Brand has exactly one file to edit.
 *
 * The first is iconography. A category is a string in the Catalog, and no
 * amount of reading it yields a drawing; the map below is hand-written and
 * deliberately so.
 *
 * The second is the example prompts. A sentence generated from Catalog data
 * would teach a Customer query syntax — the very thing the Commerce Agent
 * exists not to require. The examples are written as full sentences carrying a
 * use case, a budget, and a mood, because that is the register the Agent is
 * built for.
 */

import type { ReactElement } from "react";
import {
  Footprints,
  Handbag,
  Layers,
  Package,
  Sparkles,
  Spool,
  SportShoe,
  SprayCan,
  type LucideIcon,
} from "lucide-react";

/** The Brand's own mark: this Brand sells shoes, so the mark is a shoe. */
export const BrandMark: LucideIcon = SportShoe;

/**
 * The Commerce Agent's mark, kept distinct from the Brand's so a Customer can
 * tell whose voice they are reading.
 */
export const AgentMark: LucideIcon = Sparkles;

/**
 * The glyph each Catalog category is drawn with.
 *
 * Keyed by the lowercased category, so the Catalog's own casing and spacing
 * cannot silently miss. Size and colour are the surface's, inherited from
 * wherever the glyph is drawn.
 */
const CATEGORY_GLYPHS: Record<string, ReactElement> = {
  footwear: <SportShoe />,
  socks: <Footprints />,
  laces: <Spool />,
  insoles: <Layers />,
  "shoe care": <SprayCan />,
  "shoe accessories": <Handbag />,
};

/**
 * Draws one Catalog category's glyph.
 *
 * A category this Brand's map does not yet name falls back to a neutral
 * parcel, so a Catalog that grows a category before this file does still
 * renders.
 */
export function CategoryGlyph({ category }: { category: string }) {
  return CATEGORY_GLYPHS[category.trim().toLowerCase()] ?? <Package />;
}

/**
 * The sentences the opening state offers as examples.
 *
 * Each is a whole request rather than a keyword, and between them they cover a
 * use case, a budget, and a mood — the three shapes a Customer may not realise
 * the Commerce Agent accepts.
 */
export const EXAMPLE_PROMPTS: readonly string[] = [
  "I need cushioned running shoes for daily road training.",
  "Show me comfortable everyday shoes under ₹5,000.",
  "I want something smart enough for the office but easy to walk all day in.",
];

/**
 * The message a Customer sends by tapping one Catalog category.
 *
 * @param category - The category tapped, as the Catalog stored it.
 * @returns The Customer message that starts a Conversation Turn about it.
 */
export function categoryPrompt(category: string): string {
  return `What do you have in ${category}?`;
}

/**
 * What the document says before the Brand record has been read.
 *
 * The Storefront's own page titles itself from the Brand, so this is reached
 * only when there is no Brand to ask. It describes what is sold rather than
 * how the Storefront is built, because a Customer reading a browser tab or a
 * search result is owed the former.
 */
export const FALLBACK_METADATA = {
  title: "Everyday footwear and accessories",
  description:
    "Shop footwear, socks, laces, insoles, and shoe care by describing what you need.",
};
