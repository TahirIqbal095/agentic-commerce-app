/**
 * A deliberately separate check against the real hosted Razorpay MCP server.
 *
 * Ordinary test suites are hermetic and credential-free, so this file is not
 * part of them: it is named `.smoke.ts` rather than `.test.ts` and is invoked
 * only by `pnpm test:smoke`, with real Razorpay Test Mode credentials in the
 * environment. Running it makes a real Provider Write against the Brand's Test
 * Payment Account.
 *
 * It exists because a contract-faithful fake can only prove that this
 * application honours the contract it believes in. Whether Razorpay still
 * offers that contract is a question only Razorpay can answer.
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { storefrontRazorpayConfiguration } from "./razorpay-config";
import {
  createHostedRazorpayMcpClient,
  createRazorpayMcpAdapter,
} from "./razorpay-mcp-adapter";
import { RAZORPAY_ALLOWED_TOOLS, razorpayToolDrift } from "./razorpay-tools";

const configuration = storefrontRazorpayConfiguration();
const skip =
  configuration.status === "ENABLED"
    ? false
    : "Razorpay Test Mode credentials are not configured.";

function adapter() {
  if (configuration.status !== "ENABLED") throw new Error(skip as string);
  return createRazorpayMcpAdapter({
    basicAuthorization: configuration.basicAuthorization,
    createClient: createHostedRazorpayMcpClient,
  });
}

test("the hosted Razorpay MCP server still offers the allowlisted surface", { skip }, async () => {
  if (configuration.status !== "ENABLED") return;
  const client = await createHostedRazorpayMcpClient({
    transport: {
      type: "http",
      url: "https://mcp.razorpay.com/mcp",
      headers: { Authorization: configuration.basicAuthorization() },
      redirect: "error",
    },
    maxRetries: 0,
  });
  try {
    const { tools } = await client.listTools();
    const names = new Set(tools.map((tool) => tool.name));
    for (const allowed of RAZORPAY_ALLOWED_TOOLS) {
      assert.ok(names.has(allowed), `${allowed} is no longer offered`);
    }
    assert.equal(razorpayToolDrift(tools), null);
  } finally {
    await client.close();
  }
});

test("a Provider Order can be created and found again by its receipt", { skip }, async () => {
  const receipt = randomUUID();
  const gateway = adapter();

  const created = await gateway.createOrder({
    amountMinor: 100,
    currency: "INR",
    receipt,
    notes: { environment: "TEST", smoke: "true" },
  });

  assert.equal(created.status, "SUCCEEDED");
  if (created.status !== "SUCCEEDED") return;
  assert.equal(created.providerOrder.receipt, receipt);
  assert.equal(created.providerOrder.amountMinor, 100);

  const found = await gateway.findOrderByReceipt(receipt);
  assert.equal(found.status, "FOUND");
  if (found.status !== "FOUND") return;
  assert.equal(
    found.value.providerOrderId,
    created.providerOrder.providerOrderId,
  );
});

test("a receipt Razorpay has never seen reads as absent", { skip }, async () => {
  const outcome = await adapter().findOrderByReceipt(randomUUID());

  assert.equal(outcome.status, "ABSENT");
});
