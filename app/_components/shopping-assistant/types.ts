import type { AgentOutcome, AgentResponse } from "@/modules/agent/types";

export type { CurrentConversation, ShoppingIntent } from "@/modules/agent/types";

export type AgentResult = AgentOutcome | AgentResponse;

export type ConversationTurn = {
  id: number | string;
  customerMessage: string;
  result: AgentResult | null;
  error: string | null;
};
