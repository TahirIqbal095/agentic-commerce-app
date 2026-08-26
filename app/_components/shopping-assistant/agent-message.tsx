import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";

export function AgentMessage({ children }: { children: ReactNode }) {
  return (
    <article className="w-full">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid size-6 place-items-center rounded-lg bg-[#1d2a24] text-white">
          <Sparkles className="size-3" />
        </span>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#708176]">
          Commerce Agent
        </p>
      </div>
      {children}
    </article>
  );
}
