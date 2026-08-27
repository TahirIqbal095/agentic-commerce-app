import { google } from "@ai-sdk/google";
import { generateText, type LanguageModel } from "ai";
import { outcomeComposerConfig } from "@/config/agent/promts";
import type { OutcomeComposer } from "./commerce-agent";

export function createAiOutcomeComposer(
  model: LanguageModel = google(
    process.env.GOOGLE_GENERATIVE_AI_MODEL ?? "gemini-3.5-flash-lite",
  ),
): OutcomeComposer {
  return {
    async composeCompleted({ intentBrief, products }) {
      const { text } = await generateText({
        model,
        system: outcomeComposerConfig.completedPrompt,
        prompt: JSON.stringify({ intentBrief, products }),
      });
      return text.trim();
    },

    async composeQuestion({ intentBrief }) {
      const { text } = await generateText({
        model,
        system: outcomeComposerConfig.questionPrompt,
        prompt: JSON.stringify({
          goal: intentBrief.goal,
          missingInformation: intentBrief.missingInformation,
        }),
      });
      return oneFocusedQuestion(text);
    },
  };
}

function oneFocusedQuestion(text: string): string {
  const firstQuestion = text.trim().split("?", 1)[0]?.trim();
  if (!firstQuestion) throw new Error("The model did not return a question.");
  return `${firstQuestion}?`;
}
