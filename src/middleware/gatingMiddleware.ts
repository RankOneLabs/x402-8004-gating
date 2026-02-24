import type { Request, Response, NextFunction, RequestHandler } from "express";
import { paymentMiddleware, x402ResourceServer, type Network } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import type { ReputationProvider } from "../erc8004/types.js";
import type { GatingRoutesConfig, GatingRouteConfig } from "./types.js";
import { validateReputation } from "./reputationGate.js";
import { computePrice } from "./pricingEngine.js";
import { type Option, Some, None, isSome } from "../types/option.js";
import { type Result, Ok, Err, isErr } from "../types/result.js";
import { type PriceResolutionError, ReputationFetchFailed } from "../types/errors.js";

interface GatingMiddlewareOptions {
  gatingRoutes: GatingRoutesConfig;
  reputationProvider: ReputationProvider;
  mockMode: boolean;
  facilitatorUrl?: string;
}

// --- Pure helpers ---

export interface ParsedRoutePattern {
  method: string;
  path: string;
  isWildcard: boolean;
}

/**
 * Parse a "METHOD /path" or "METHOD /path/*" route pattern string.
 * Returns None for malformed input, Some({...}) for valid patterns.
 */
export const parseRoutePattern = (pattern: string): Option<ParsedRoutePattern> => {
  const [method, path] = pattern.split(" ", 2);
  if (!method || !path) return None;

  const isWildcard = path.endsWith("/*");
  return Some({
    method,
    path: isWildcard ? path.slice(0, -2) : path,
    isWildcard,
  });
};

/**
 * Resolve the effective price for a gated route, applying reputation discount
 * in combined mode when an agent address is available.
 * Returns Ok(price) on success, Err(PriceResolutionError) on failure.
 */
export const resolvePrice = async (
  agentAddress: string | undefined,
  config: GatingRouteConfig,
  reputationProvider: ReputationProvider,
): Promise<Result<string, PriceResolutionError>> => {
  const basePrice = config.payment!.basePrice;
  if (config.mode !== "combined" || !agentAddress) return Ok(basePrice);

  try {
    const result = await reputationProvider.getScore(
      agentAddress,
      config.reputation?.tag1,
      config.reputation?.tag2,
    );
    return Ok(computePrice(result.score, basePrice, config.priceTiers));
  } catch (error) {
    return Err(ReputationFetchFailed(agentAddress, error));
  }
};

/**
 * Type predicate: true when a route entry has payment config and is not reputation-only.
 */
export const isPaymentRoute = (
  entry: [string, GatingRouteConfig],
): entry is [string, GatingRouteConfig & { payment: NonNullable<GatingRouteConfig["payment"]> }] => {
  const [, config] = entry;
  return config.mode !== "reputation" && config.payment != null;
};

/**
 * Curried mapper: transforms a [routeKey, GatingRouteConfig] entry into
 * a [routeKey, x402Config] entry for the x402 payment middleware.
 */
const toX402RouteEntry = (reputationProvider: ReputationProvider) =>
  ([routeKey, config]: [string, GatingRouteConfig]): [string, unknown] => {
    const { network, payTo, basePrice } = config.payment!;
    validateNetwork(network, routeKey);

    const price = config.mode === "combined"
      ? async (context: { adapter: { getHeader: (name: string) => string | undefined } }) => {
          const result = await resolvePrice(context.adapter.getHeader("x-agent-address"), config, reputationProvider);
          if (isErr(result)) {
            console.error("Failed to fetch reputation score for agent in combined mode; falling back to base price.", {
              agentAddress: result.error.agentAddress,
              cause: result.error.cause,
            });
            return basePrice;
          }
          return result.value;
        }
      : basePrice;

    return [routeKey, {
      accepts: {
        scheme: "exact",
        network: network as Network,
        payTo,
        price,
        maxTimeoutSeconds: 60,
      },
      description: config.description || routeKey,
    }];
  };

// --- Core functions ---

/**
 * Build the unified gating middleware stack.
 *
 * Returns an array of Express middleware to app.use() in order:
 * 1. Reputation-only gate (handles "reputation" mode routes)
 * 2. x402 payment middleware (handles "payment" and "combined" mode routes)
 *
 * In mock mode, x402 is replaced with a lightweight mock that returns
 * 402 responses and accepts any X-Payment-Mock header as proof of payment.
 */
export function createGatingMiddleware(
  options: GatingMiddlewareOptions,
): RequestHandler[] {
  const { gatingRoutes, reputationProvider, mockMode, facilitatorUrl } = options;

  // Middleware 1: reputation-only gate
  const reputationMiddleware: RequestHandler = async (req, res, next) => {
    const matched = matchRoute(req, gatingRoutes);
    if (!isSome(matched) || matched.value.mode !== "reputation") {
      return next();
    }
    if (!matched.value.reputation) {
      return next();
    }
    const agentAddress = req.headers["x-agent-address"] as string | undefined;
    const result = await validateReputation(agentAddress, reputationProvider, matched.value.reputation);
    if (isErr(result)) {
      switch (result.error._tag) {
        case "MissingAgentAddress":
          return res.status(403).json({
            error: "Missing X-Agent-Address header",
            detail: "Reputation-gated endpoints require agent identification.",
          });
        case "InvalidAgentAddress":
          return res.status(400).json({
            error: "Invalid X-Agent-Address header",
            detail: "The provided address is not a valid EVM address.",
          });
        case "InsufficientReputation":
          return res.status(403).json({
            error: "Insufficient reputation",
            detail: `Score ${result.error.score} is below the required minimum of ${result.error.required}.`,
            score: result.error.score,
            required: result.error.required,
            feedbackCount: result.error.feedbackCount,
          });
      }
    }
    next();
  };

  // Middleware 2: payment (x402 or mock)
  let paymentMw: RequestHandler;

  if (mockMode) {
    paymentMw = createMockPaymentMiddleware(gatingRoutes, reputationProvider);
  } else {
    paymentMw = createX402Middleware(gatingRoutes, reputationProvider, facilitatorUrl);
  }

  return [reputationMiddleware, paymentMw];
}

/**
 * Validate that a network string is in CAIP-2 format (e.g. "eip155:84532").
 * Throws an Error with a descriptive message if the format is invalid.
 */
function validateNetwork(network: string, routeKey: string): asserts network is Network {
  const parts = network.split(":");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(
      `Invalid network identifier "${network}" for route "${routeKey}". ` +
        `Expected CAIP-2 format "namespace:reference" (e.g. "eip155:84532").`,
    );
  }
}

/**
 * Build real x402 payment middleware for payment + combined routes.
 */
function createX402Middleware(
  gatingRoutes: GatingRoutesConfig,
  reputationProvider: ReputationProvider,
  facilitatorUrl?: string,
): RequestHandler {
  const url = facilitatorUrl || "https://x402.org/facilitator";
  const facilitatorClient = new HTTPFacilitatorClient({ url });
  const resourceServer = new x402ResourceServer(facilitatorClient)
    .register("eip155:84532", new ExactEvmScheme());

  const x402Routes = Object.fromEntries(
    Object.entries(gatingRoutes)
      .filter(isPaymentRoute)
      .map(toX402RouteEntry(reputationProvider)),
  );

  if (Object.keys(x402Routes).length === 0) {
    return (_req, _res, next) => next();
  }

  return paymentMiddleware(
    x402Routes as Parameters<typeof paymentMiddleware>[0],
    resourceServer,
    { testnet: true },
  );
}

/**
 * Mock payment middleware for local development.
 * Returns 402 with payment info when no payment header is present.
 * Accepts X-Payment-Mock: true as proof of payment.
 */
function createMockPaymentMiddleware(
  gatingRoutes: GatingRoutesConfig,
  reputationProvider: ReputationProvider,
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const matched = matchRoute(req, gatingRoutes);
    if (!isSome(matched)) return next();
    const routeConfig = matched.value;
    if (routeConfig.mode === "reputation") return next(); // handled upstream

    if (!routeConfig.payment) return next();

    // Check for mock payment header
    const hasMockPayment = req.headers["x-payment-mock"] === "true";
    if (hasMockPayment) return next();

    // Compute price (may be discounted for combined mode)
    const agentAddress = req.headers["x-agent-address"] as string | undefined;
    const priceResult = await resolvePrice(agentAddress, routeConfig, reputationProvider);
    const price = isErr(priceResult)
      ? (console.error("Failed to fetch reputation score for agent in combined mode; falling back to base price.", {
          agentAddress: priceResult.error.agentAddress,
          cause: priceResult.error.cause,
        }), routeConfig.payment.basePrice)
      : priceResult.value;

    // Return 402 Payment Required
    res.status(402).json({
      x402Version: 2,
      error: "Payment Required",
      accepts: {
        scheme: "exact",
        network: routeConfig.payment.network,
        payTo: routeConfig.payment.payTo,
        price,
        maxTimeoutSeconds: 60,
      },
      description: routeConfig.description,
      mock: true,
      hint: 'Set header "X-Payment-Mock: true" to simulate payment',
    });
  };
}

/**
 * Match an incoming request to a gating route config.
 * Supports "METHOD /path" format matching.
 */
export function matchRoute(
  req: Request,
  routes: GatingRoutesConfig,
): Option<GatingRouteConfig> {
  const method = req.method.toUpperCase();
  const path = req.path;

  // Try exact match first
  const exactKey = `${method} ${path}`;
  if (routes[exactKey]) return Some(routes[exactKey]);

  // Try wildcard match (e.g. "GET /api/premium/*")
  const wildcardMatch = Object.entries(routes).find(([pattern]) => {
    const parsed = parseRoutePattern(pattern);
    if (!isSome(parsed) || !parsed.value.isWildcard) return false;
    if (parsed.value.method !== method) return false;
    return path === parsed.value.path || path.startsWith(parsed.value.path + "/");
  });

  return wildcardMatch ? Some(wildcardMatch[1]) : None;
}
