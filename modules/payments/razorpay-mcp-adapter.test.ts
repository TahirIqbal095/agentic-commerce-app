import assert from "node:assert/strict";
import test from "node:test";
import {
  createRazorpayMcpAdapter,
  type RazorpayMcpCallResult,
  type RazorpayMcpClientConfig,
} from "./razorpay-mcp-adapter";
import {
  RAZORPAY_ALLOWED_TOOLS,
  RAZORPAY_MCP_ENDPOINT,
  RAZORPAY_TOOL_SCHEMAS,
} from "./razorpay-tools";

const SECRET = "rzp_test_key:super-secret-value";
const AUTHORIZATION = `Basic ${Buffer.from(SECRET).toString("base64")}`;

/** Tool definitions matching the surface this application was written against. */
function compatibleTools() {
  return RAZORPAY_ALLOWED_TOOLS.map((name) => ({
    name,
    inputSchema: { required: [...RAZORPAY_TOOL_SCHEMAS[name].required] },
  }));
}

const createdOrder = {
  id: "order_TEST0000000001",
  receipt: "81000000-0000-4000-8000-000000000001",
  amount: 1599700,
  currency: "INR",
  status: "created",
  notes: { orderId: "71000000-0000-4000-8000-000000000001" },
};

type FakeTransport = {
  configs: RazorpayMcpClientConfig[];
  calls: Array<{ name: string; arguments?: Record<string, unknown> }>;
  closed: number;
};

function fakeMcp(
  respond: (call: { name: string }) => RazorpayMcpCallResult | Promise<never>,
  tools = compatibleTools(),
) {
  const transport: FakeTransport = { configs: [], calls: [], closed: 0 };
  const createClient = async (config: RazorpayMcpClientConfig) => {
    transport.configs.push(config);
    return {
      async listTools() {
        return { tools };
      },
      async callTool(call: { name: string; arguments?: Record<string, unknown> }) {
        transport.calls.push(call);
        return respond(call);
      },
      async close() {
        transport.closed += 1;
      },
    };
  };
  return { transport, createClient };
}

function adapterFor(
  respond: (call: { name: string }) => RazorpayMcpCallResult | Promise<never>,
  tools?: ReturnType<typeof compatibleTools>,
) {
  const { transport, createClient } = fakeMcp(respond, tools);
  return {
    transport,
    adapter: createRazorpayMcpAdapter({
      basicAuthorization: () => AUTHORIZATION,
      createClient,
    }),
  };
}

const createOrderInput = {
  amountMinor: 1599700,
  currency: "INR",
  receipt: createdOrder.receipt,
  notes: { orderId: "71000000-0000-4000-8000-000000000001" },
};

test("every operation uses the fixed hosted endpoint with redirects and retries off", async () => {
  const { adapter, transport } = adapterFor(() => ({
    structuredContent: createdOrder,
  }));

  await adapter.createOrder(createOrderInput);

  assert.equal(transport.configs.length, 1);
  const [config] = transport.configs;
  assert.equal(config.transport.type, "http");
  assert.equal(config.transport.url, RAZORPAY_MCP_ENDPOINT);
  assert.equal(config.transport.redirect, "error");
  assert.equal(config.maxRetries, 0);
});

test("the Basic header is built per operation and appears nowhere else", async () => {
  const { adapter, transport } = adapterFor(() => ({
    structuredContent: createdOrder,
  }));

  const outcome = await adapter.createOrder(createOrderInput);

  assert.equal(transport.configs[0].transport.headers.Authorization, AUTHORIZATION);
  assert.equal(JSON.stringify(outcome).includes("super-secret-value"), false);
  assert.equal(JSON.stringify(outcome).includes(AUTHORIZATION), false);
  assert.equal(
    JSON.stringify(transport.calls).includes("super-secret-value"),
    false,
  );
});

test("the client is closed after a successful operation and after a failed one", async () => {
  const { adapter, transport } = adapterFor(() => ({
    structuredContent: createdOrder,
  }));
  await adapter.createOrder(createOrderInput);
  assert.equal(transport.closed, 1);

  const failing = adapterFor(() => Promise.reject(new Error("timeout")));
  await failing.adapter.createOrder(createOrderInput);
  assert.equal(failing.transport.closed, 1);
});

test("only the allowlisted capabilities are ever invoked", async () => {
  const { adapter, transport } = adapterFor((call) =>
    call.name === "fetch_all_orders"
      ? { structuredContent: { items: [createdOrder] } }
      : { structuredContent: createdOrder },
  );

  await adapter.createOrder(createOrderInput);
  await adapter.findOrderByReceipt(createdOrder.receipt);
  await adapter.fetchOrder(createdOrder.id);
  await adapter.fetchPayment("pay_TEST0000000001");

  for (const call of transport.calls) {
    assert.ok(
      (RAZORPAY_ALLOWED_TOOLS as readonly string[]).includes(call.name),
      `${call.name} is outside the allowlist`,
    );
  }
  assert.deepEqual(
    transport.calls.map((call) => call.name),
    ["create_order", "fetch_all_orders", "fetch_order", "fetch_payment"],
  );
});

test("arguments are validated locally before anything is dispatched", async () => {
  const { adapter, transport } = adapterFor(() => ({
    structuredContent: createdOrder,
  }));

  const outcome = await adapter.createOrder({
    ...createOrderInput,
    currency: "USD",
  });

  assert.equal(outcome.status, "FAILED");
  assert.equal(
    outcome.status === "FAILED" && outcome.reasonCode,
    "PROVIDER_ARGUMENTS_INVALID",
  );
  assert.deepEqual(transport.calls, []);
  assert.deepEqual(transport.configs, []);
});

test("incompatible remote tool drift blocks the Provider Write", async () => {
  const drifted = compatibleTools().map((tool) =>
    tool.name === "create_order"
      ? { ...tool, inputSchema: { required: ["amount", "currency"] } }
      : tool,
  );
  const { adapter, transport } = adapterFor(
    () => ({ structuredContent: createdOrder }),
    drifted,
  );

  const outcome = await adapter.createOrder(createOrderInput);

  assert.equal(outcome.status, "FAILED");
  assert.equal(
    outcome.status === "FAILED" && outcome.reasonCode,
    "PROVIDER_TOOL_DRIFT",
  );
  assert.deepEqual(transport.calls, []);
});

test("a withdrawn allowlisted capability blocks the Provider Write", async () => {
  const withdrawn = compatibleTools().filter(
    (tool) => tool.name !== "fetch_order",
  );
  const { adapter } = adapterFor(
    () => ({ structuredContent: createdOrder }),
    withdrawn,
  );

  const outcome = await adapter.createOrder(createOrderInput);

  assert.equal(
    outcome.status === "FAILED" && outcome.reasonCode,
    "PROVIDER_TOOL_DRIFT",
  );
});

test("a result that cannot be parsed never becomes commerce state", async () => {
  const { adapter } = adapterFor(() => ({
    structuredContent: { id: "order_TEST1", amount: "1599700" },
  }));

  const outcome = await adapter.createOrder(createOrderInput);

  assert.equal(
    outcome.status === "FAILED" && outcome.reasonCode,
    "PROVIDER_RESULT_UNREADABLE",
  );
});

test("a lost response after dispatch is unknown rather than failed", async () => {
  const { adapter } = adapterFor(() => Promise.reject(new Error("timeout")));

  const outcome = await adapter.createOrder(createOrderInput);

  assert.equal(outcome.status, "OUTCOME_UNKNOWN");
  assert.equal(
    outcome.status === "OUTCOME_UNKNOWN" && outcome.reasonCode,
    "PROVIDER_RESPONSE_LOST",
  );
});

test("a receipt with no Provider Order reads as absent, not unavailable", async () => {
  const { adapter } = adapterFor(() => ({
    structuredContent: { items: [] },
  }));

  const outcome = await adapter.findOrderByReceipt(createdOrder.receipt);

  assert.equal(outcome.status, "ABSENT");
});

test("an unreachable provider read is unavailable, not absent", async () => {
  const { adapter } = adapterFor(() => Promise.reject(new Error("offline")));

  const outcome = await adapter.fetchOrder(createdOrder.id);

  assert.equal(outcome.status, "UNAVAILABLE");
});

test("a receipt lookup returning another order's receipt finds nothing", async () => {
  const { adapter } = adapterFor(() => ({
    structuredContent: {
      items: [{ ...createdOrder, receipt: "someone-elses-receipt" }],
    },
  }));

  const outcome = await adapter.findOrderByReceipt(createdOrder.receipt);

  assert.equal(outcome.status, "ABSENT");
});

test("the deterministic fault dispatches once and then discards the response", async () => {
  let faults = 1;
  const { transport, createClient } = fakeMcp(() => ({
    structuredContent: createdOrder,
  }));
  const adapter = createRazorpayMcpAdapter({
    basicAuthorization: () => AUTHORIZATION,
    createClient,
    loseNextWriteResponse: () => faults-- > 0,
  });

  const lost = await adapter.createOrder(createOrderInput);
  const second = await adapter.createOrder(createOrderInput);

  assert.equal(lost.status, "OUTCOME_UNKNOWN");
  assert.equal(second.status, "SUCCEEDED");
  assert.deepEqual(
    transport.calls.map((call) => call.name),
    ["create_order", "create_order"],
  );
});
