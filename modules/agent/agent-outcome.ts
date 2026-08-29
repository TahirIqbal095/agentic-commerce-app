import type { AgentOutcome } from "./types";

export function isAgentOutcome(value: unknown): value is AgentOutcome {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    ["COMPLETED", "NEEDS_INPUT", "TEMPORARILY_UNAVAILABLE"].includes(
      String(value.status),
    )
  );
}
