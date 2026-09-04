import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";

/**
 * How close to the newest content a Customer must be for an arriving answer to
 * scroll.
 *
 * Roughly a line or two of slack, so someone waiting at the bottom is still
 * followed when the last message does not end exactly at the fold, while
 * someone who has scrolled up to re-read a Recommendation plainly has not.
 */
const NEAR_NEWEST_TOLERANCE_PX = 120;

/**
 * What the Transcript currently holds, as the scrolling rules read it.
 *
 * Both counts are deliberately counts rather than the entries themselves: a
 * checkout status card changing in place — a retry, a reconciliation — moves
 * neither, which is exactly why pressing a control on the card a Customer is
 * reading does not move the page.
 */
export type TranscriptPosition = {
  /** How many entries the Transcript holds. */
  entryCount: number;
  /** How many of them have the answer they were waiting for. */
  answeredCount: number;
};

export type TranscriptScroll = {
  /**
   * Marks the next Transcript change as a Conversation being resumed.
   *
   * Resuming is an arrival, not a movement, so it is positioned instantly
   * rather than animated through the whole history the Customer already read.
   */
  markResumed(): void;
};

function scrollToNewest(behavior: ScrollBehavior) {
  window.scrollTo({
    top: document.documentElement.scrollHeight,
    behavior,
  });
}

function isNearNewest() {
  const remaining =
    document.documentElement.scrollHeight -
    (window.scrollY + window.innerHeight);
  return remaining <= NEAR_NEWEST_TOLERANCE_PX;
}

/**
 * Keeps the Conversation Transcript following the Conversation.
 *
 * The Transcript is scrolled through the window and has no scroll container of
 * its own. Two rules decide what moves the page. Anything the Customer just
 * did — sending a message, pressing Check out, pressing Review for checkout —
 * scrolls unconditionally, because they are entitled to see what they asked
 * for. Anything the Commerce Agent produced scrolls only if the Customer was
 * already waiting at the newest content, so re-reading an earlier
 * Recommendation is never interrupted by a reply.
 *
 * Whether the Customer is waiting at the bottom is remembered from their last
 * scroll rather than measured after the answer lands. A long answer pushes the
 * bottom away as it renders, so measuring afterwards would decide that someone
 * who had been waiting at the fold had wandered off, and leave the reply they
 * were waiting for below it.
 *
 * @param position - What the Transcript holds this render.
 * @returns The one signal the Storefront has to give it: that a Conversation
 *   was resumed rather than added to.
 */
export function useTranscriptScroll(
  position: TranscriptPosition,
): TranscriptScroll {
  const reduceMotion = useReducedMotion();
  const { entryCount, answeredCount } = position;
  const isResumed = useRef(entryCount > 0);
  const wasNearNewest = useRef(true);
  const previous = useRef({ entryCount: 0, answeredCount: 0 });

  useEffect(() => {
    const remember = () => {
      wasNearNewest.current = isNearNewest();
    };
    remember();
    window.addEventListener("scroll", remember, { passive: true });
    return () => window.removeEventListener("scroll", remember);
  }, []);

  useEffect(() => {
    const last = previous.current;
    previous.current = { entryCount, answeredCount };
    if (entryCount === 0) {
      isResumed.current = false;
      return;
    }
    if (isResumed.current) {
      isResumed.current = false;
      scrollToNewest("instant");
      return;
    }
    const behavior: ScrollBehavior = reduceMotion ? "instant" : "smooth";
    if (entryCount > last.entryCount) {
      scrollToNewest(behavior);
      return;
    }
    if (answeredCount > last.answeredCount && wasNearNewest.current) {
      scrollToNewest(behavior);
    }
  }, [entryCount, answeredCount, reduceMotion]);

  return {
    markResumed() {
      isResumed.current = true;
    },
  };
}
