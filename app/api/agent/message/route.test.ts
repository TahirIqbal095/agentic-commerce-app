import assert from "node:assert/strict";
import test from "node:test";
import type { CommerceAgent } from "@/modules/agent/commerce-agent";
import { createPostHandler } from "./route";

test("accepts a user prompt and returns the structured agent response", async () => {
  const messages: string[] = [];
  const agent: CommerceAgent = {
    async respond(input) {
      messages.push(input.message);
      return {
        message: "Here are the products currently available in our catalog.",
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
      message: "Here are the products currently available in our catalog.",
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
