import type {
  AgentOutcome,
  AgentResponse,
} from "@/modules/agent/agent-outcome";

export type { CurrentConversation } from "@/modules/agent/conversation-state";
export type { ShoppingIntent } from "@/modules/agent/intent";

export type AgentResult = AgentOutcome | AgentResponse;

export type ConversationTurn = {
  id: number | string;
  customerMessage: string;
  result: AgentResult | null;
  error: string | null;
};

export type CartFeedback = {
  kind: "success" | "error";
  message: string;
};
