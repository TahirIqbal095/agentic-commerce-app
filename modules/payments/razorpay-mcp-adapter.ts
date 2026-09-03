/**
 * The server-only adapter that reaches Razorpay's hosted MCP server.
 *
 * Everything about this file is deliberately narrow. It connects to one fixed
 * Streamable HTTP endpoint, authenticates with a Basic header built in server
 * code from credentials it never stores, refuses redirects, disables automatic
 * transport retries, invokes only allowlisted and locally validated tools,
 * checks the remote tool surface for drift before any Provider Write, parses
 * every result into an application-owned type, and closes its client when the
 * operation ends.
 *
 * The Commerce Agent never receives these tools. There is no path from a model
 * response to `callTool`: the only callers are the deterministic checkout
 * authority's own operations.
 */

import {
  RAZORPAY_CREATE_ORDER,
  RAZORPAY_FETCH_ALL_ORDERS,
  RAZORPAY_FETCH_ORDER,
  RAZORPAY_FETCH_PAYMENT,
  RAZORPAY_MCP_ENDPOINT,
  RAZORPAY_PROVIDER_WRITES,
  isAllowedRazorpayTool,
  parseProviderOrder,
  parseProviderPayment,
  razorpayToolDrift,
  validateCreateOrderArguments,
  type ProviderOrderResult,
  type ProviderPaymentResult,
} from "./razorpay-tools";
import type {
  CreateProviderOrderInput,
  ProviderReadOutcome,
  RazorpayProviderGateway,
} from "./razorpay-gateway";

/** The transport configuration this adapter always uses, exactly. */
export type RazorpayMcpClientConfig = {
  transport: {
    type: "http";
    url: string;
    headers: Record<string, string>;
    redirect: "error";
  };
  maxRetries: 0;
};

export type RazorpayMcpToolDefinition = {
  name: string;
  inputSchema?: unknown;
};

export type RazorpayMcpCallResult = {
  content?: Array<{ type?: string; text?: string }>;
  structuredContent?: unknown;
  isError?: boolean;
};

/** The slice of an MCP client this adapter uses. Injected so tests can fake it. */
export type RazorpayMcpClient = {
  listTools(): Promise<{ tools: RazorpayMcpToolDefinition[] }>;
  callTool(input: {
    name: string;
    arguments?: Record<string, unknown>;
  }): Promise<RazorpayMcpCallResult>;
  close(): Promise<void>;
};

export type RazorpayMcpClientFactory = (
  config: RazorpayMcpClientConfig,
) => Promise<RazorpayMcpClient>;

export type RazorpayMcpAdapterOptions = {
  /** Builds the Basic authorization value. Called per operation, never stored. */
  basicAuthorization: () => string;
  createClient: RazorpayMcpClientFactory;
  endpoint?: string;
  /**
   * A test-environment-only behavior that dispatches a Provider Write and
   * discards its response once, so graceful recovery from an Unknown Provider
   * Outcome is repeatable. It is a constructor argument, never reachable from
   * Customer input or a production composition root.
   */
  loseNextWriteResponse?: () => boolean;
};

/**
 * A refusal raised before anything left this process.
 *
 * It is distinct from a lost response on purpose: nothing was dispatched, so
 * there is no provider state to reconcile and no possibility of a duplicate.
 */
class ProviderRefusal extends Error {
  constructor(
    readonly reasonCode: string,
    message: string,
  ) {
    super(message);
    this.name = "ProviderRefusal";
  }
}

export function createRazorpayMcpAdapter(
  options: RazorpayMcpAdapterOptions,
): RazorpayProviderGateway {
  const endpoint = options.endpoint ?? RAZORPAY_MCP_ENDPOINT;

  /**
   * Runs one operation against a short-lived client.
   *
   * A client is created per operation and closed in `finally`, so a failed or
   * lost call cannot leave an authenticated session open. The Basic header is
   * built here and never returned, logged, or persisted.
   */
  async function withClient<Result>(
    operation: (client: RazorpayMcpClient) => Promise<Result>,
  ): Promise<Result> {
    const client = await options.createClient({
      transport: {
        type: "http",
        url: endpoint,
        headers: { Authorization: options.basicAuthorization() },
        redirect: "error",
      },
      maxRetries: 0,
    });
    try {
      return await operation(client);
    } finally {
      await client.close();
    }
  }

  /**
   * Invokes one allowlisted tool and returns its parsed payload.
   *
   * A name outside the allowlist is refused before the client is asked for it,
   * so a future caller cannot reach a Payment Action by passing a string. A
   * Provider Write additionally checks the remote tool surface for drift, so an
   * automatic update to the hosted server cannot silently change what a
   * Customer's Approval authorizes.
   */
  async function callAllowedTool(
    client: RazorpayMcpClient,
    name: string,
    toolArguments: Record<string, unknown>,
  ): Promise<unknown> {
    if (!isAllowedRazorpayTool(name)) {
      throw new ProviderRefusal(
        "PROVIDER_TOOL_NOT_ALLOWED",
        "This Storefront does not use that Razorpay capability.",
      );
    }
    if (RAZORPAY_PROVIDER_WRITES.includes(name)) {
      const { tools } = await client.listTools();
      const drift = razorpayToolDrift(tools);
      if (drift) {
        throw new ProviderRefusal("PROVIDER_TOOL_DRIFT", drift);
      }
    }

    const result = await client.callTool({ name, arguments: toolArguments });
    if (result.isError) {
      throw new ProviderRefusal(
        "PROVIDER_REJECTED",
        "Razorpay refused this request.",
      );
    }
    return readPayload(result);
  }

  const gateway: RazorpayProviderGateway = {
    async createOrder(input: CreateProviderOrderInput) {
      const toolArguments = {
        amount: input.amountMinor,
        currency: input.currency,
        receipt: input.receipt,
        notes: input.notes,
      };
      const invalid = validateCreateOrderArguments(toolArguments);
      if (invalid) {
        return {
          status: "FAILED" as const,
          reasonCode: "PROVIDER_ARGUMENTS_INVALID",
          message: invalid,
        };
      }

      let dispatched = false;
      try {
        return await withClient(async (client) => {
          if (RAZORPAY_PROVIDER_WRITES.includes(RAZORPAY_CREATE_ORDER)) {
            const { tools } = await client.listTools();
            const drift = razorpayToolDrift(tools);
            if (drift) {
              throw new ProviderRefusal("PROVIDER_TOOL_DRIFT", drift);
            }
          }
          dispatched = true;
          const payload = await client.callTool({
            name: RAZORPAY_CREATE_ORDER,
            arguments: toolArguments,
          });
          if (options.loseNextWriteResponse?.()) {
            throw new Error("The Razorpay response was not received.");
          }
          if (payload.isError) {
            return {
              status: "FAILED" as const,
              reasonCode: "PROVIDER_REJECTED",
              message: "Razorpay refused to create the payment.",
            };
          }
          const providerOrder = parseProviderOrder(readPayload(payload));
          if (!providerOrder) {
            return {
              status: "FAILED" as const,
              reasonCode: "PROVIDER_RESULT_UNREADABLE",
              message: "Razorpay returned a payment this Storefront could not read.",
            };
          }
          return { status: "SUCCEEDED" as const, providerOrder };
        });
      } catch (error) {
        if (error instanceof ProviderRefusal) {
          return {
            status: "FAILED",
            reasonCode: error.reasonCode,
            message: error.message,
          };
        }
        // Dispatched with no answer: Razorpay may or may not have created the
        // Provider Order, so this is unknown rather than failed, and must be
        // reconciled by receipt before anything else happens.
        return dispatched
          ? {
              status: "OUTCOME_UNKNOWN",
              reasonCode: "PROVIDER_RESPONSE_LOST",
              message: "Razorpay's answer did not arrive.",
            }
          : {
              status: "FAILED",
              reasonCode: "PROVIDER_UNREACHABLE",
              message: "Razorpay could not be reached.",
            };
      }
    },

    async findOrderByReceipt(receipt) {
      return read(async (client) => {
        const payload = await callAllowedTool(
          client,
          RAZORPAY_FETCH_ALL_ORDERS,
          { receipt, count: 10 },
        );
        const items = (payload as { items?: unknown })?.items;
        const orders = Array.isArray(items) ? items : [];
        const matches = orders
          .map(parseProviderOrder)
          .filter((order): order is ProviderOrderResult => order !== null)
          .filter((order) => order.receipt === receipt);
        return matches.length === 1 ? matches[0] : null;
      });
    },

    async fetchOrder(providerOrderId) {
      return read(async (client) =>
        parseProviderOrder(
          await callAllowedTool(client, RAZORPAY_FETCH_ORDER, {
            order_id: providerOrderId,
          }),
        ),
      );
    },

    async fetchPayment(providerPaymentId) {
      return read(async (client) =>
        parseProviderPayment(
          await callAllowedTool(client, RAZORPAY_FETCH_PAYMENT, {
            payment_id: providerPaymentId,
          }),
        ),
      );
    },
  };
  return Object.freeze(gateway);

  /**
   * Runs one provider read.
   *
   * A read that finds nothing is absent, not unavailable: reconciliation
   * depends on telling "Razorpay created nothing" apart from "Razorpay could
   * not be asked", because only the first permits another bounded attempt.
   */
  async function read<Value>(
    operation: (client: RazorpayMcpClient) => Promise<Value | null>,
  ): Promise<ProviderReadOutcome<Value>> {
    try {
      const value = await withClient(operation);
      return value === null
        ? { status: "ABSENT" }
        : { status: "FOUND", value };
    } catch (error) {
      return error instanceof ProviderRefusal
        ? {
            status: "UNAVAILABLE",
            reasonCode: error.reasonCode,
            message: error.message,
          }
        : {
            status: "UNAVAILABLE",
            reasonCode: "PROVIDER_UNREACHABLE",
            message: "Razorpay could not be reached.",
          };
    }
  }
}

/**
 * Reads the payload out of one MCP result.
 *
 * Structured content is preferred; text content is parsed as JSON only when
 * that is all the server sent. Anything else yields `null`, which every caller
 * treats as unreadable rather than as an empty success.
 */
function readPayload(result: RazorpayMcpCallResult): unknown {
  if (result.structuredContent !== undefined) return result.structuredContent;
  const text = result.content?.find((part) => part.type === "text")?.text;
  if (typeof text !== "string") return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Builds the production adapter over the AI SDK's separately packaged client. */
export async function createHostedRazorpayMcpClient(
  config: RazorpayMcpClientConfig,
): Promise<RazorpayMcpClient> {
  const { createMCPClient } = await import("@ai-sdk/mcp");
  const client = await createMCPClient(config);
  return {
    listTools: () => client.listTools(),
    callTool: (input) =>
      client.callTool(input) as Promise<RazorpayMcpCallResult>,
    close: () => client.close(),
  };
}

export type { ProviderOrderResult, ProviderPaymentResult };
