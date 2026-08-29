import assert from "node:assert/strict";
import test from "node:test";
import type { CommerceAgent } from "@/modules/agent/commerce-agent";
import { ConversationAccessError } from "@/modules/agent/conversation";
import { createPostHandler } from "./handler";

test("accepts a user prompt without exposing client Brand selection to the agent", async () => {
  const messages: string[] = [];
  const agent: CommerceAgent = {
    async respond(input) {
      messages.push(input.message);
      return {
        status: "COMPLETED",
        conversationId: "41000000-0000-4000-8000-000000000001",
        message: "I found products matching your request.",
        intentBrief: {
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
          knownEntities: [{ type: "PRODUCT_TYPE", value: "headphones" }],
          missingInformation: [],
          confidence: 0.9,
          requestedEffects: ["DISCOVER_PRODUCTS"],
        },
        products: [],
      };
    },
  };
  const POST = createPostHandler(async () => agent);

  const response = await POST(
    new Request("http://localhost/api/agent/message", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        brandId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        message: "show me products",
      }),
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(messages, ["show me products"]);
  assert.deepEqual(await response.json(), {
    data: {
      status: "COMPLETED",
      conversationId: "41000000-0000-4000-8000-000000000001",
      message: "I found products matching your request.",
      intentBrief: {
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
        knownEntities: [{ type: "PRODUCT_TYPE", value: "headphones" }],
        missingInformation: [],
        confidence: 0.9,
        requestedEffects: ["DISCOVER_PRODUCTS"],
      },
      products: [],
    },
  });
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

test("passes a conversation identifier to the Commerce Agent", async () => {
  const receivedInputs: Array<{ conversationId?: string; message: string }> = [];
  const agent: CommerceAgent = {
    async respond(input) {
      receivedInputs.push(input);
      return {
        status: "COMPLETED",
        conversationId: "41000000-0000-4000-8000-000000000001",
        message: "I found products matching your refinement.",
        intentBrief: {
          goal: "Refine Product discovery",
          constraints: {
            productTypes: [],
            useCases: [],
            features: ["waterproof"],
            category: null,
            minPriceMinor: null,
            maxPriceMinor: null,
            size: null,
            inStockOnly: true,
            attributes: {},
          },
          knownEntities: [],
          missingInformation: [],
          confidence: 0.8,
          requestedEffects: ["DISCOVER_PRODUCTS"],
        },
        products: [],
      };
    },
  };
  const POST = createPostHandler(async () => agent);

  const response = await POST(
    new Request("http://localhost/api/agent/message", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        conversationId: "41000000-0000-4000-8000-000000000001",
        message: "only the waterproof ones",
      }),
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(receivedInputs, [
    {
      conversationId: "41000000-0000-4000-8000-000000000001",
      message: "only the waterproof ones",
    },
  ]);
});

test("rejects a conversation outside the current User's ownership", async () => {
  const agent: CommerceAgent = {
    async respond() {
      throw new ConversationAccessError();
    },
  };
  const POST = createPostHandler(async () => agent);

  const response = await POST(
    new Request("http://localhost/api/agent/message", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        conversationId: "41000000-0000-4000-8000-000000000099",
        message: "show me more like those",
      }),
    }),
  );

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    error: {
      code: "CONVERSATION_NOT_FOUND",
      message: "The conversation was not found.",
      details: {},
    },
  });
});

test("rejects a malformed conversation identifier before creating an agent", async () => {
  let agentCreated = false;
  const POST = createPostHandler(async () => {
    agentCreated = true;
    throw new Error("The agent should not be created");
  });

  const response = await POST(
    new Request("http://localhost/api/agent/message", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        conversationId: "not-a-conversation-id",
        message: "show me more",
      }),
    }),
  );

  assert.equal(response.status, 400);
  assert.equal(agentCreated, false);
  assert.deepEqual(await response.json(), {
    error: {
      code: "INVALID_CONVERSATION_ID",
      message: "conversationId must be a UUID.",
      details: { field: "conversationId" },
    },
  });
});
