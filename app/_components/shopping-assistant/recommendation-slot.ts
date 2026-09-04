/**
 * The width of one Recommendation slot.
 *
 * Every card in a Recommendation Set is laid out on this one measure, so the
 * carousel advances by a predictable step and a Customer sees the next card
 * peeking rather than a row whose stride changes with its contents.
 */
export const RECOMMENDATION_SLOT_WIDTH =
  "w-[min(82vw,20rem)] sm:w-[min(20rem,calc((100%-1rem)/2.2))] lg:w-[min(20rem,calc((100%-2rem)/2.7))]";
