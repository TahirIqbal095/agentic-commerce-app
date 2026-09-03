/**
 * The trusted boundary around Razorpay's remote MCP server.
 *
 * The hosted server is an outbound integration adapter, never an authorization
 * boundary (ADR-0009). It is a third party's surface that can change under us,
 * so nothing it returns is believed on its own: only explicitly named tools may
 * be invoked, arguments are validated against local schemas before they are
 * sent, incompatible drift in the remote tool definitions blocks Provider
 * Writes, and every result is parsed into an application-owned type before it
 * can become commerce state.
 *
 * Payment initiation, OTP submission, capture, Payment Links, QR codes,
 * refunds, token operations, and generic tool dispatch are absent by
 * construction: there is no code path that names them.
 */

import { createHash } from "node:crypto";

/** Razorpay's fixed hosted Streamable HTTP MCP endpoint. */
export const RAZORPAY_MCP_ENDPOINT = "https://mcp.razorpay.com/mcp";

/**
 * The only capabilities this Storefront may invoke.
 *
 * One Provider Write — creating a Provider Order — and the exact reads needed
 * to fetch, verify, and reconcile Provider Orders and Provider Payments.
 */
export const RAZORPAY_CREATE_ORDER = "create_order" as const;
export const RAZORPAY_FETCH_ORDER = "fetch_order" as const;
export const RAZORPAY_FETCH_ALL_ORDERS = "fetch_all_orders" as const;
export const RAZORPAY_FETCH_PAYMENT = "fetch_payment" as const;

export const RAZORPAY_ALLOWED_TOOLS = [
  RAZORPAY_CREATE_ORDER,
  RAZORPAY_FETCH_ORDER,
  RAZORPAY_FETCH_ALL_ORDERS,
  RAZORPAY_FETCH_PAYMENT,
] as const;

export type RazorpayAllowedTool = (typeof RAZORPAY_ALLOWED_TOOLS)[number];

/** The only tool that changes payment-provider state. */
export const RAZORPAY_PROVIDER_WRITES: readonly string[] = [
  RAZORPAY_CREATE_ORDER,
];

export function isAllowedRazorpayTool(
  name: string,
): name is RazorpayAllowedTool {
  return (RAZORPAY_ALLOWED_TOOLS as readonly string[]).includes(name);
}

/**
 * The arguments each allowlisted capability requires, as this application
 * understands them. A remote definition that no longer accepts them is drift,
 * not a reason to send something else.
 */
export const RAZORPAY_TOOL_SCHEMAS: Record<
  RazorpayAllowedTool,
  { required: readonly string[] }
> = {
  create_order: { required: ["amount", "currency", "receipt"] },
  fetch_order: { required: ["order_id"] },
  fetch_all_orders: { required: [] },
  fetch_payment: { required: ["payment_id"] },
};

/** The arguments one Provider Order creation carries. */
export type CreateProviderOrderArguments = {
  amount: number;
  currency: string;
  receipt: string;
  notes: Record<string, string>;
};

/**
 * Checks one Provider Order creation before it is dispatched.
 *
 * A malformed amount, a currency this release does not collect, a missing
 * receipt, or a note that is not a plain string would all become a Provider
 * Write the Storefront could not later reconcile, so they are refused here
 * rather than sent and regretted.
 *
 * @returns `null` when the arguments are valid, or the reason they are not.
 */
export function validateCreateOrderArguments(
  arguments_: CreateProviderOrderArguments,
): string | null {
  if (
    !Number.isSafeInteger(arguments_.amount) ||
    arguments_.amount < 100 ||
    arguments_.amount > 5_000_000
  ) {
    return "amount must be a whole number of paise within the checkout bounds.";
  }
  if (arguments_.currency !== "INR") {
    return "currency must be INR.";
  }
  if (typeof arguments_.receipt !== "string" || arguments_.receipt.length === 0) {
    return "receipt must identify the Provider Operation.";
  }
  for (const [key, value] of Object.entries(arguments_.notes)) {
    if (typeof value !== "string" || value.length > 200) {
      return `note ${key} must be a short string.`;
    }
  }
  return null;
}

/** A Provider Order as this application understands it. */
export type ProviderOrderResult = {
  providerOrderId: string;
  receipt: string;
  amountMinor: number;
  currency: string;
  status: string;
  notes: Record<string, string>;
};

/** A Provider Payment as this application understands it. */
export type ProviderPaymentResult = {
  providerPaymentId: string;
  providerOrderId: string;
  amountMinor: number;
  currency: string;
  status: string;
  captured: boolean;
};

/**
 * Parses one remote order into an application-owned Provider Order.
 *
 * Malformed remote data returns `null` rather than a partly-filled record: a
 * Provider Order the Storefront cannot fully describe must never become
 * authoritative commerce state, because a Customer would then be shown a
 * payment whose amount or receipt we could not stand behind.
 */
export function parseProviderOrder(value: unknown): ProviderOrderResult | null {
  if (typeof value !== "object" || value === null) return null;
  const order = value as Record<string, unknown>;
  const id = order.id;
  const receipt = order.receipt;
  const amount = order.amount;
  const currency = order.currency;
  const status = order.status;
  if (
    typeof id !== "string" ||
    id.length === 0 ||
    typeof receipt !== "string" ||
    typeof currency !== "string" ||
    typeof status !== "string" ||
    !Number.isSafeInteger(amount)
  ) {
    return null;
  }
  return {
    providerOrderId: id,
    receipt,
    amountMinor: amount as number,
    currency,
    status,
    notes: parseNotes(order.notes),
  };
}

export function parseProviderPayment(
  value: unknown,
): ProviderPaymentResult | null {
  if (typeof value !== "object" || value === null) return null;
  const payment = value as Record<string, unknown>;
  const id = payment.id;
  const orderId = payment.order_id;
  const amount = payment.amount;
  const currency = payment.currency;
  const status = payment.status;
  if (
    typeof id !== "string" ||
    typeof orderId !== "string" ||
    typeof currency !== "string" ||
    typeof status !== "string" ||
    !Number.isSafeInteger(amount)
  ) {
    return null;
  }
  return {
    providerPaymentId: id,
    providerOrderId: orderId,
    amountMinor: amount as number,
    currency,
    status,
    captured: status === "captured" || payment.captured === true,
  };
}

function parseNotes(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null) return {};
  const notes: Record<string, string> = {};
  for (const [key, note] of Object.entries(value as Record<string, unknown>)) {
    if (typeof note === "string") notes[key] = note;
  }
  return notes;
}

/**
 * A stable fingerprint of the allowlisted remote tool definitions.
 *
 * Automatic MCP updates can change a hosted server's tools without warning, so
 * the boundary is pinned rather than trusted: the fingerprint covers each
 * allowlisted tool's name and its required arguments, and a change to either
 * blocks Provider Writes until a person has looked. Tools outside the allowlist
 * are ignored, because the Storefront never invokes them and their churn is
 * none of its business.
 *
 * @param tools - The remote server's advertised tool definitions.
 * @returns A short digest of the allowlisted surface.
 */
export function fingerprintRazorpayTools(
  tools: Array<{ name: string; inputSchema?: unknown }>,
): string {
  const surface = RAZORPAY_ALLOWED_TOOLS.map((allowed) => {
    const tool = tools.find((candidate) => candidate.name === allowed);
    if (!tool) return `${allowed}:absent`;
    return `${allowed}:${requiredArguments(tool.inputSchema).join(",")}`;
  }).join("|");
  return createHash("sha256").update(surface).digest("hex").slice(0, 32);
}

/**
 * Whether the remote server still offers the allowlisted surface this
 * application was written against.
 *
 * @param tools - The remote server's advertised tool definitions.
 * @returns `null` when compatible, or the reason writes must be blocked.
 */
export function razorpayToolDrift(
  tools: Array<{ name: string; inputSchema?: unknown }>,
): string | null {
  for (const allowed of RAZORPAY_ALLOWED_TOOLS) {
    const tool = tools.find((candidate) => candidate.name === allowed);
    if (!tool) {
      return `Razorpay no longer offers ${allowed}.`;
    }
    const required = requiredArguments(tool.inputSchema);
    const missing = RAZORPAY_TOOL_SCHEMAS[allowed].required.filter(
      (argument) => !required.includes(argument),
    );
    const added = required.filter(
      (argument) =>
        !RAZORPAY_TOOL_SCHEMAS[allowed].required.includes(argument),
    );
    if (missing.length > 0 || added.length > 0) {
      return `Razorpay changed the required arguments of ${allowed}.`;
    }
  }
  return null;
}

function requiredArguments(inputSchema: unknown): string[] {
  const required = (inputSchema as { required?: unknown } | undefined)?.required;
  return Array.isArray(required)
    ? [...required].filter((value): value is string => typeof value === "string").sort()
    : [];
}
