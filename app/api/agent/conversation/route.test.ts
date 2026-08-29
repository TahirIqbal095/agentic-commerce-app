import assert from "node:assert/strict";
import test from "node:test";
import { createConversationHandler } from "./handler";
import { createEmptyConversationContext } from "@/modules/agent/conversation-context";

test("loads the Customer's current Conversation Transcript and Context Summary", async () => {
  const context = {
    ...createEmptyConversationContext(),
    revision: 2,
    productConstraints: {
      ...createEmptyConversationContext().productConstraints,
      productTypes: ["shoes"],
      maxPriceMinor: 400000,
    },
  };
  const snapshot = {
    conversationId: "41000000-0000-4000-8000-000000000001",
    transcript: [
      {
        id: "51000000-0000-4000-8000-000000000001",
        customerMessage: "I want shoes under 4000",
        result: null,
        error: null,
      },
    ],
    contextSummary: context.productConstraints,
    revision: 2,
  };
  const handler = createConversationHandler({
    async loadCurrent() {
      return snapshot;
    },
    async resetCurrent() {},
  });

  const response = await handler.GET();

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { data: snapshot });
});

test("removes the current Conversation from Customer access", async () => {
  let resets = 0;
  const handler = createConversationHandler({
    async loadCurrent() {
      return null;
    },
    async resetCurrent() {
      resets += 1;
    },
  });

  const response = await handler.DELETE();

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { data: { reset: true } });
  assert.equal(resets, 1);
});
