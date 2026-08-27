import assert from "node:assert/strict";
import test from "node:test";
import type { CommerceAgent } from "@/modules/agent/commerce-agent";
import { ConversationAccessError } from "@/modules/agent/conversation";
import { createPostHandler } from "./route";

const intentBrief = {
  goal: "Find headphones",
  constraints: {
    productTypes: ["headphones"],
    useCases: [],
    features: [],
    category: "Audio",
    minPriceMinor: null,
    maxPriceMinor: null,
    size: null,
    inStockOnly: true,
    attributes: {},
  },
  knownEntities: [{ type: "PRODUCT_TYPE" as const, value: "headphones" }],
  missingInformation: [],
  confidence: 0.9,
  requestedEffects: ["DISCOVER_PRODUCTS" as const],
};

test("accepts a user prompt and returns the structured agent response", async () => {
  const messages: string[] = [];
  const agent: CommerceAgent = {
    async respond(input) {
      messages.push(input.message);
      return {
        status: "COMPLETED",
        conversationId: "41000000-0000-4000-8000-000000000001",
        message: "I found products matching your request.",
        intentBrief,
        products: [],
      };
    },
  };
  const POST = createPostHandler(async () => agent);

  const response = await POST(
    new Request("http://localhost/api/agent/message", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "show me products" }),
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(messages, ["show me products"]);
  assert.deepEqual(await response.json(), {
    data: {
      status: "COMPLETED",
      conversationId: "41000000-0000-4000-8000-000000000001",
      message: "I found products matching your request.",
      intentBrief,
      products: [],
    },
  });
});

test("passes a valid conversation identifier to the Commerce Agent", async () => {
  let received: unknown;
  const agent: CommerceAgent = { async respond(input) { received = input; return { status: "COMPLETED", conversationId: input.conversationId!, message: "Refined.", intentBrief, products: [] }; } };
  const POST = createPostHandler(async () => agent);
  const response = await POST(new Request("http://localhost/api/agent/message", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ conversationId: "41000000-0000-4000-8000-000000000001", message: "only waterproof" }) }));
  assert.equal(response.status, 200);
  assert.deepEqual(received, { conversationId: "41000000-0000-4000-8000-000000000001", message: "only waterproof" });
});

test("rejects inaccessible and malformed conversation identifiers", async () => {
  const inaccessible: CommerceAgent = { async respond() { throw new ConversationAccessError(); } };
  const inaccessiblePost = createPostHandler(async () => inaccessible);
  const inaccessibleResponse = await inaccessiblePost(new Request("http://localhost/api/agent/message", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ conversationId: "41000000-0000-4000-8000-000000000099", message: "more" }) }));
  assert.equal(inaccessibleResponse.status, 404);

  let created = false;
  const malformedPost = createPostHandler(async () => { created = true; return inaccessible; });
  const malformedResponse = await malformedPost(new Request("http://localhost/api/agent/message", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ conversationId: "bad", message: "more" }) }));
  assert.equal(malformedResponse.status, 400);
  assert.equal(created, false);
});

test("rejects an empty user prompt before creating an agent", async () => {
  let agentCreated = false;
  const POST = createPostHandler(async () => {
    agentCreated = true;
    throw new Error("The agent should not be created");
  });

  const response = await POST(
    new Request("http://localhost/api/agent/message", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "   " }),
    }),
  );

  assert.equal(response.status, 400);
  assert.equal(agentCreated, false);
  assert.deepEqual(await response.json(), {
    error: {
      code: "INVALID_MESSAGE",
      message: "message cannot be empty.",
      details: { field: "message" },
    },
  });
});
