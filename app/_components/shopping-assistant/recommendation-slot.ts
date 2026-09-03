/**
 * The width of one Recommendation slot.
 *
 * The pending placeholders occupy the same slots the arriving Recommendation
 * cards will, so the two share this width rather than restating it. A
 * disagreement between them is what makes a Recommendation Set appear to jump
 * when it replaces the placeholders.
 */
export const RECOMMENDATION_SLOT_WIDTH =
  "w-[min(82vw,20rem)] sm:w-[min(20rem,calc((100%-1rem)/2.2))] lg:w-[min(20rem,calc((100%-2rem)/2.7))]";
