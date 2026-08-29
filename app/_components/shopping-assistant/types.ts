import type { AgentOutcome, AgentResponse } from "@/modules/agent/types";

export type { ShoppingIntent } from "@/modules/agent/types";

export type AgentResult = AgentOutcome | AgentResponse;

export type ConversationTurn = {
  id: number;
  customerMessage: string;
  result: AgentResult | null;
  error: string | null;
};
