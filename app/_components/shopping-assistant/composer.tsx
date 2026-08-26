import type { FormEvent } from "react";
import { ArrowUp, Sparkles } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function Composer({
  prompt,
  setPrompt,
  isLoading,
  onSubmit,
}: {
  prompt: string;
  setPrompt: (prompt: string) => void;
  isLoading: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 bg-gradient-to-t from-[#f4f1eb] via-[#f4f1eb]/95 to-transparent px-4 pb-4 pt-16 sm:pb-6 sm:pt-20">
      <motion.form
        onSubmit={onSubmit}
        initial={{ opacity: 0, y: reduceMotion ? 0 : 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
        className="group relative mx-auto w-full max-w-3xl rounded-[1.65rem] border border-[#1d2a24]/10 bg-white/88 p-2 shadow-[0_24px_70px_-24px_rgba(29,42,36,0.38)] backdrop-blur-2xl transition-[border-color,box-shadow] duration-300 focus-within:border-[#708176]/45 focus-within:shadow-[0_28px_80px_-24px_rgba(29,42,36,0.48)]"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-8 -top-px h-px bg-gradient-to-r from-transparent via-white to-transparent"
        />
        <div className="flex items-end gap-2">
          <div className="flex min-w-0 flex-1 items-start gap-3 pl-3">
            <span className="mt-3.5 grid size-7 shrink-0 place-items-center rounded-lg bg-[#e8ece6] text-[#526158] transition-colors group-focus-within:bg-[#1d2a24] group-focus-within:text-white">
              <Sparkles className="size-3.5" />
            </span>
            <label htmlFor="shopping-prompt" className="sr-only">
              Message the shopping assistant
            </label>
            <Textarea
              id="shopping-prompt"
              value={prompt}
              rows={1}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="What are you looking for?"
              autoComplete="off"
              className="max-h-36 min-h-18 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-0 py-3.5 text-[20px] font-medium leading-6 text-[#1d2a24] shadow-none field-sizing-content placeholder:text-[#8c958f] focus-visible:ring-0"
            />
          </div>
          <Button
            type="submit"
            size="icon"
            disabled={isLoading || prompt.trim().length === 0}
            aria-label={isLoading ? "Searching catalog" : "Send"}
            className="mb-1 size-10 shrink-0 rounded-2xl bg-[#1d2a24] text-white shadow-lg shadow-[#1d2a24]/15 transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#31463a] hover:shadow-xl disabled:translate-y-0 disabled:bg-[#dfe3df] disabled:text-[#9da49f] disabled:shadow-none"
          >
            {isLoading ? (
              <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <ArrowUp className="size-5" />
            )}
          </Button>
        </div>
        <div className="flex items-center justify-between px-3 pb-1.5 pt-1 text-[11px] text-[#8c958f]">
          <span className="flex items-center gap-1.5">
            <span className="size-1 rounded-full bg-[#57a773]" />
            Searches the live merchant catalog
          </span>
          <span className="hidden sm:inline">
            Be specific or wonderfully vague
          </span>
        </div>
      </motion.form>
    </div>
  );
}
