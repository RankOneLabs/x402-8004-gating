import type { Request, Response, NextFunction, RequestHandler } from "express";
import { paymentMiddleware, x402ResourceServer, type Network } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import type { ReputationProvider } from "../erc8004/types.js";
import type { GatingRoutesConfig, GatingRouteConfig } from "./types.js";
import { checkReputation } from "./reputationGate.js";
import { computePrice } from "./pricingEngine.js";

interface GatingMiddlewareOptions {
  gatingRoutes: GatingRoutesConfig;
  reputationProvider: ReputationProvider;
  mockMode: boolean;
  facilitatorUrl?: string;
}

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
    const routeConfig = matchRoute(req, gatingRoutes);
    if (!routeConfig || routeConfig.mode !== "reputation") {
      return next();
    }
    if (!routeConfig.reputation) {
      return next();
    }
    const score = await checkReputation(req, res, reputationProvider, routeConfig.reputation);
    if (score === null) return; // 403 already sent
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

  // Build x402 RoutesConfig from our gating routes (only payment + combined)
  const x402Routes: Record<string, unknown> = {};

  for (const [routeKey, config] of Object.entries(gatingRoutes)) {
    if (config.mode === "reputation") continue; // handled by reputation middleware
    if (!config.payment) continue;

    const { network, payTo } = config.payment;
    validateNetwork(network, routeKey);

    if (config.mode === "payment") {
      // Static price
      x402Routes[routeKey] = {
        accepts: {
          scheme: "exact",
          network: network as Network,
          payTo,
          price: config.payment.basePrice,
          maxTimeoutSeconds: 60,
        },
        description: config.description || routeKey,
      };
    } else if (config.mode === "combined") {
      // Dynamic price — query reputation inside the callback
      const basePrice = config.payment.basePrice;
      const tiers = config.priceTiers;

      x402Routes[routeKey] = {
        accepts: {
          scheme: "exact",
          network: network as Network,
          payTo,
          maxTimeoutSeconds: 60,
          price: async (context: { adapter: { getHeader: (name: string) => string | undefined } }) => {
            const agentAddress = context.adapter.getHeader("x-agent-address");
            if (!agentAddress) return basePrice;

            try {
              const result = await reputationProvider.getScore(
                agentAddress,
                config.reputation?.tag1,
                config.reputation?.tag2,
              );
              return computePrice(result.score, basePrice, tiers);
            } catch (error) {
              console.error(
                "Failed to fetch reputation score for agent in combined mode; falling back to base price.",
                { agentAddress, error }
              );
              return basePrice; // fallback to full price on error
            }
          },
        },
        description: config.description || routeKey,
      };
    }
  }

  if (Object.keys(x402Routes).length === 0) {
    // No payment routes — return passthrough
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
    const routeConfig = matchRoute(req, gatingRoutes);
    if (!routeConfig) return next();
    if (routeConfig.mode === "reputation") return next(); // handled upstream

    if (!routeConfig.payment) return next();

    // Check for mock payment header
    const hasMockPayment = req.headers["x-payment-mock"] === "true";
    if (hasMockPayment) return next();

    // Compute price (may be discounted for combined mode)
    let price = routeConfig.payment.basePrice;
    if (routeConfig.mode === "combined") {
      const agentAddress = req.headers["x-agent-address"] as string | undefined;
      if (agentAddress) {
        try {
          const result = await reputationProvider.getScore(
            agentAddress,
            routeConfig.reputation?.tag1,
            routeConfig.reputation?.tag2,
          );
          price = computePrice(result.score, routeConfig.payment.basePrice, routeConfig.priceTiers);
        } catch (err) {
          console.warn(
            "Failed to fetch reputation score in combined gating mode; falling back to base price.",
            { agentAddress, error: err },
          );
          // fallback to base price
        }
      }
    }

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
): GatingRouteConfig | null {
  const method = req.method.toUpperCase();
  const path = req.path;

  // Try exact match first
  const exactKey = `${method} ${path}`;
  if (routes[exactKey]) return routes[exactKey];

  // Try wildcard match (e.g. "GET /api/premium/*")
  for (const [pattern, config] of Object.entries(routes)) {
    const [routeMethod, routePath] = pattern.split(" ", 2);
    // Validate pattern format: must be "METHOD /path"
    if (!routeMethod || !routePath) continue;
    if (routeMethod !== method) continue;

    if (routePath.endsWith("/*")) {
      const prefix = routePath.slice(0, -2);
      // Match exact prefix or any subpath, but avoid matching similar prefixes like "/apibar"
      if (path === prefix || path.startsWith(prefix + "/")) {
        return config;
      }
    }
  }

  return null;
}
