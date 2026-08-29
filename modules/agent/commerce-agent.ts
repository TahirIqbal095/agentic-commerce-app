import type { CatalogModule } from "@/modules/catalog/catalog";
import type {
  CatalogProduct,
  CatalogSearch,
  CatalogSearchResult,
  ProductDetailResult,
} from "@/modules/catalog/types";
import { ConversationAccessError } from "./conversation";
import type { AgentMessage, AgentOutcome, IntentBrief } from "./types";

export interface CommerceAgent {
  respond(input: AgentMessage): Promise<AgentOutcome>;
}

export interface IntentAnalyzer {
  analyze(message: string): Promise<IntentBrief>;
}

export type CommerceCapabilities = {
  searchProducts?: (input: CatalogSearch) => Promise<CatalogSearchResult>;
  getProduct?: (productId: string) => Promise<ProductDetailResult>;
};

export type CommerceAgentLoopResult =
  | {
      status: "COMPLETED";
      message: string;
      productIds: string[];
    }
  | {
      status: "NEEDS_INPUT";
      message: string;
      question: string;
      missingInformation: string[];
    }
  | { status: "LIMIT_REACHED" };

export type CommerceAgentLoopInput = {
  message: string;
  intentBrief: IntentBrief;
  capabilities: CommerceCapabilities;
  limits: CommerceAgentLimits;
  signal: AbortSignal;
};

export interface CommerceAgentLoop {
  run(input: CommerceAgentLoopInput): Promise<CommerceAgentLoopResult>;
}

export type CommerceAgentLimits = {
  maxSteps: number;
  timeoutMs: number;
  maxOutputTokens: number;
  maxToolProducts: number;
};

export const MAX_COMMERCE_AGENT_TOOL_PRODUCTS = 8;

type AgentTurn = {
  conversationId: string;
  recordIntentBrief(intentBrief: IntentBrief): Promise<void>;
  complete(assistantMessage: string, outcome: AgentOutcome): Promise<void>;
};

export interface ConversationModule {
  startTurn(input: AgentMessage): Promise<AgentTurn>;
}

type CommerceAgentOptions = {
  agentLoop: CommerceAgentLoop;
  limits?: CommerceAgentLimits;
};

const COMMERCE_AGENT_LIMITS: CommerceAgentLimits = {
  maxSteps: 5,
  timeoutMs: 15_000,
  maxOutputTokens: 2_000,
  maxToolProducts: MAX_COMMERCE_AGENT_TOOL_PRODUCTS,
};

export function createCommerceAgent(
  catalog: CatalogModule,
  analyzer: IntentAnalyzer,
  conversation: ConversationModule,
  options: CommerceAgentOptions,
): CommerceAgent {
  return {
    async respond(input): Promise<AgentOutcome> {
      let turn: AgentTurn;
      try {
        turn = await conversation.startTurn(input);
      } catch (error) {
        if (error instanceof ConversationAccessError) throw error;
        return {
          status: "TEMPORARILY_UNAVAILABLE",
          ...(input.conversationId
            ? { conversationId: input.conversationId }
            : {}),
          message:
            "I couldn't start that conversation right now. Please try again.",
          retryable: true,
          products: [],
        };
      }
      let intentBrief: IntentBrief;
      try {
        intentBrief = await analyzer.analyze(input.message);
      } catch {
        const outcome: AgentOutcome = {
          status: "TEMPORARILY_UNAVAILABLE",
          conversationId: turn.conversationId,
          message:
            "I couldn't understand that request right now. Please try again.",
          retryable: true,
          products: [],
        };
        return completeTurn(turn, outcome);
      }

      try {
        await turn.recordIntentBrief(intentBrief);
      } catch {
        return completeTurn(turn, {
          status: "TEMPORARILY_UNAVAILABLE",
          conversationId: turn.conversationId,
          message: "I couldn't save that request right now. Please try again.",
          retryable: true,
          intentBrief,
          products: [],
        });
      }
      let loopResult: CommerceAgentLoopResult;
      const observedProducts = new Map<string, CatalogProduct>();
      const limits = boundedAgentLimits(options.limits);
      const controller = new AbortController();
      const capabilities = resolveCapabilities({
        catalog,
        intentBrief,
        limits,
        signal: controller.signal,
        observedProducts,
      });

      try {
        loopResult = await runBoundedAgentLoop(
          options.agentLoop,
          {
            message: input.message,
            intentBrief,
            capabilities,
            limits,
            signal: controller.signal,
          },
          controller,
        );
      } catch {
        if (controller.signal.aborted) {
          return completeTurn(
            turn,
            limitOutcome(
              turn.conversationId,
              intentBrief,
              observedProducts,
              limits.maxToolProducts,
            ),
          );
        }
        return completeTurn(turn, {
          status: "TEMPORARILY_UNAVAILABLE",
          conversationId: turn.conversationId,
          message:
            "Product discovery is temporarily unavailable. Please try again.",
          retryable: true,
          intentBrief,
          products: [],
        });
      }

      if (loopResult.status === "LIMIT_REACHED") {
        return completeTurn(
          turn,
          limitOutcome(
            turn.conversationId,
            intentBrief,
            observedProducts,
            limits.maxToolProducts,
          ),
        );
      }

      if (loopResult.status === "NEEDS_INPUT") {
        return completeTurn(turn, {
          ...loopResult,
          conversationId: turn.conversationId,
          intentBrief,
          products: [],
        });
      }

      if (
        loopResult.productIds.some(
          (productId) => !observedProducts.has(productId),
        )
      ) {
        return completeTurn(
          turn,
          limitOutcome(
            turn.conversationId,
            intentBrief,
            observedProducts,
            limits.maxToolProducts,
          ),
        );
      }

      const products = loopResult.productIds.flatMap((productId) => {
        const product = observedProducts.get(productId);
        return product ? [product] : [];
      });
      return completeTurn(turn, {
        status: "COMPLETED",
        conversationId: turn.conversationId,
        message: loopResult.message,
        intentBrief,
        products,
      });
    },
  };
}

function resolveCapabilities({
  catalog,
  intentBrief,
  limits,
  signal,
  observedProducts,
}: {
  catalog: CatalogModule;
  intentBrief: IntentBrief;
  limits: CommerceAgentLimits;
  signal: AbortSignal;
  observedProducts: Map<string, CatalogProduct>;
}): CommerceCapabilities {
  if (!intentBrief.requestedEffects.includes("DISCOVER_PRODUCTS")) return {};

  const assertLoopActive = () => {
    if (signal.aborted) {
      throw new Error("The Commerce Agent run has ended.");
    }
  };

  return {
    async searchProducts(search) {
      assertLoopActive();
      const result = await catalog.search({
        ...search,
        limit: Math.max(1, Math.min(search.limit, limits.maxToolProducts)),
      });
      assertLoopActive();
      const boundedProducts = result.products.slice(0, limits.maxToolProducts);
      for (const product of boundedProducts) {
        observedProducts.set(product.id, product);
      }
      return { ...result, products: boundedProducts };
    },
    async getProduct(productId) {
      assertLoopActive();
      const result = await catalog.getProduct(productId);
      assertLoopActive();
      if (result.ok) observedProducts.set(result.value.id, result.value);
      return result;
    },
  };
}

async function runBoundedAgentLoop(
  agentLoop: CommerceAgentLoop,
  input: CommerceAgentLoopInput,
  controller: AbortController,
): Promise<CommerceAgentLoopResult> {
  let rejectTimeout: (reason: Error) => void = () => {};
  const timedOut = new Promise<never>((_resolve, reject) => {
    rejectTimeout = reject;
  });
  const timeout = setTimeout(() => {
    controller.abort();
    rejectTimeout(new Error("The Commerce Agent timed out."));
  }, input.limits.timeoutMs);
  timeout.unref?.();

  try {
    return await Promise.race([agentLoop.run(input), timedOut]);
  } finally {
    clearTimeout(timeout);
  }
}

function boundedAgentLimits(
  requested: CommerceAgentLimits | undefined,
): CommerceAgentLimits {
  if (!requested) return COMMERCE_AGENT_LIMITS;

  return {
    maxSteps: positiveCeiling(
      requested.maxSteps,
      COMMERCE_AGENT_LIMITS.maxSteps,
    ),
    timeoutMs: positiveCeiling(
      requested.timeoutMs,
      COMMERCE_AGENT_LIMITS.timeoutMs,
    ),
    maxOutputTokens: positiveCeiling(
      requested.maxOutputTokens,
      COMMERCE_AGENT_LIMITS.maxOutputTokens,
    ),
    maxToolProducts: positiveCeiling(
      requested.maxToolProducts,
      COMMERCE_AGENT_LIMITS.maxToolProducts,
    ),
  };
}

function positiveCeiling(requested: number, ceiling: number): number {
  if (!Number.isFinite(requested)) return ceiling;
  return Math.max(1, Math.min(Math.floor(requested), ceiling));
}

function limitOutcome(
  conversationId: string,
  intentBrief: IntentBrief,
  observedProducts: Map<string, CatalogProduct>,
  maxProducts: number,
): AgentOutcome {
  const products = [...observedProducts.values()].slice(0, maxProducts);
  if (products.length > 0) {
    return {
      status: "COMPLETED",
      conversationId,
      message: `I found ${products.length} ${products.length === 1 ? "Product" : "Products"} before the search reached its limit.`,
      intentBrief,
      products,
    };
  }

  const question = "Could you narrow the Product type or try the search again?";
  return {
    status: "NEEDS_INPUT",
    conversationId,
    message: question,
    question,
    missingInformation:
      intentBrief.missingInformation.length > 0
        ? intentBrief.missingInformation
        : ["Product preferences"],
    intentBrief,
    products: [],
  };
}

async function completeTurn(
  turn: AgentTurn,
  outcome: AgentOutcome,
): Promise<AgentOutcome> {
  try {
    await turn.complete(outcome.message, outcome);
    return outcome;
  } catch {
    return {
      status: "TEMPORARILY_UNAVAILABLE",
      conversationId: turn.conversationId,
      message: "I couldn't save that response right now. Please try again.",
      retryable: true,
      ...(outcome.intentBrief ? { intentBrief: outcome.intentBrief } : {}),
      products: [],
    };
  }
}
