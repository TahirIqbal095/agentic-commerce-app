import type { ReactNode } from "react";

import { AgentMark } from "./brand-presentation";

export function AgentMessage({ children }: { children: ReactNode }) {
  return (
    <article className="w-full">
      <div className="mb-4 flex items-center gap-2">
        <span className="grid size-6 place-items-center rounded-sm border-2 border-sidebar-border bg-primary text-primary-foreground">
          <AgentMark className="size-3" />
        </span>
        <p className="eyebrow text-[10px] font-bold text-muted-foreground">
          Commerce Agent
        </p>
      </div>
      {children}
    </article>
  );
}
