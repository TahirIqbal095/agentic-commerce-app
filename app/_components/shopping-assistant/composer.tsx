import type { FormEvent } from "react";
import { ArrowUp, Radio, Sparkles } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * The Storefront's composer dock.
 *
 * The dock is opaque and spans the viewport with a structural top border, so
 * the Conversation Transcript stops cleanly at its edge rather than scrolling
 * confusingly beneath the control the Customer is typing into.
 */
export function Composer({
  brandName,
  prompt,
  setPrompt,
  isLoading,
  onSubmit,
}: {
  brandName: string;
  prompt: string;
  setPrompt: (prompt: string) => void;
  isLoading: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-sidebar-border bg-background px-4 pb-4 pt-4 sm:pb-5">
      <motion.form
        onSubmit={onSubmit}
        initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.25 }}
        className="group mx-auto w-full max-w-3xl rounded-lg border-2 border-sidebar-border bg-card p-2 text-card-foreground shadow-hard"
      >
        <div className="flex items-end gap-2">
          <div className="flex min-w-0 flex-1 items-start gap-3 pl-2">
            <span className="mt-3 grid size-7 shrink-0 place-items-center rounded-sm border border-border bg-muted text-foreground transition-colors group-focus-within:bg-primary group-focus-within:text-primary-foreground motion-reduce:transition-none">
              <Sparkles className="size-3.5" />
            </span>
            <label htmlFor="shopping-prompt" className="sr-only">
              Message the {brandName} Commerce Agent
            </label>
            <Textarea
              id="shopping-prompt"
              value={prompt}
              rows={1}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="What are you looking for?"
              autoComplete="off"
              className="max-h-36 min-h-16 flex-1 resize-none overflow-x-hidden overflow-y-auto border-0 bg-transparent px-0 py-3 text-lg font-medium leading-6 shadow-none field-sizing-content"
            />
          </div>
          <Button
            type="submit"
            size="icon"
            disabled={isLoading || prompt.trim().length === 0}
            aria-label={isLoading ? "Searching catalog" : "Send"}
            className="mb-1 shrink-0"
          >
            {isLoading ? (
              <span
                aria-hidden="true"
                className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
              />
            ) : (
              <ArrowUp />
            )}
          </Button>
        </div>
        <div className="flex items-center justify-between gap-3 px-2 pb-1 pt-1.5 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Radio aria-hidden="true" className="size-3 text-secondary" />
            Searches {brandName}&apos;s live Catalog
          </span>
          <span className="hidden sm:inline">
            Be specific or wonderfully vague
          </span>
        </div>
      </motion.form>
    </div>
  );
}
