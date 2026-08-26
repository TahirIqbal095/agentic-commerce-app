import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

const progressStages = [
  "Understanding your request",
  "Searching the live catalog",
  "Comparing the strongest matches",
  "Preparing your shortlist",
];

export function AgentProgress() {
  const [activeStage, setActiveStage] = useState(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const interval = window.setInterval(() => {
      setActiveStage((stage) => Math.min(stage + 1, progressStages.length - 1));
    }, 800);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="h-8 max-w-xl overflow-hidden pt-0.5">
      <AnimatePresence mode="wait" initial={false}>
        <motion.p
          key={progressStages[activeStage]}
          aria-current="step"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -16 }}
          transition={{
            duration: reduceMotion ? 0.15 : 0.35,
            ease: [0.22, 1, 0.36, 1],
          }}
          className="flex items-center gap-2.5 text-sm text-[#526158]"
        >
          <motion.span
            aria-hidden="true"
            animate={reduceMotion ? undefined : { opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
            className="size-1.5 shrink-0 rounded-full bg-[#57a773]"
          />
          {progressStages[activeStage]}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}
