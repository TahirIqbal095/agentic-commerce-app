import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";

export function AgentMessage({ children }: { children: ReactNode }) {
  return (
    <article className="w-full">
      <div className="mb-4 flex items-center gap-2">
        <span className="grid size-6 place-items-center rounded-sm border-2 border-sidebar-border bg-primary text-primary-foreground">
          <Sparkles className="size-3" />
        </span>
        <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Commerce Agent
        </p>
      </div>
      {children}
    </article>
  );
}
