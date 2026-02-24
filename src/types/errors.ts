// Domain error types as discriminated unions

// --- Config errors (startup validation, extend Error for stack traces) ---

export class InvalidRoutePattern extends Error {
  readonly _tag = "InvalidRoutePattern" as const;
  constructor(readonly pattern: string) {
    super(
      `Invalid route pattern "${pattern}". ` +
        `Expected "METHOD /path" format (e.g. "GET /api/paid" or "POST /api/premium/*").`,
    );
    this.name = "InvalidRoutePattern";
  }
}

export class InvalidNetworkFormat extends Error {
  readonly _tag = "InvalidNetworkFormat" as const;
  constructor(
    readonly network: string,
    readonly routeKey: string,
  ) {
    super(
      `Invalid network identifier "${network}" for route "${routeKey}". ` +
        `Expected CAIP-2 format "namespace:reference" (e.g. "eip155:84532").`,
    );
    this.name = "InvalidNetworkFormat";
  }
}

export type ConfigError = InvalidRoutePattern | InvalidNetworkFormat;

// --- Reputation gate errors ---

export interface MissingAgentAddress {
  readonly _tag: "MissingAgentAddress";
}

export interface InvalidAgentAddress {
  readonly _tag: "InvalidAgentAddress";
  readonly address: string;
}

export interface InsufficientReputation {
  readonly _tag: "InsufficientReputation";
  readonly score: number;
  readonly required: number;
  readonly feedbackCount: number;
}

export type ReputationGateError =
  | MissingAgentAddress
  | InvalidAgentAddress
  | InsufficientReputation;

export const MissingAgentAddress: MissingAgentAddress = { _tag: "MissingAgentAddress" };

export const InvalidAgentAddress = (address: string): InvalidAgentAddress => ({
  _tag: "InvalidAgentAddress",
  address,
});

export const InsufficientReputation = (
  score: number,
  required: number,
  feedbackCount: number,
): InsufficientReputation => ({
  _tag: "InsufficientReputation",
  score,
  required,
  feedbackCount,
});

// --- Price resolution errors ---

export interface ReputationFetchFailed {
  readonly _tag: "ReputationFetchFailed";
  readonly agentAddress: string;
  readonly cause: unknown;
}

export type PriceResolutionError = ReputationFetchFailed;

export const ReputationFetchFailed = (
  agentAddress: string,
  cause: unknown,
): ReputationFetchFailed => ({
  _tag: "ReputationFetchFailed",
  agentAddress,
  cause,
});

// --- ERC-8004 errors ---

export interface InvalidAddressFormat {
  readonly _tag: "InvalidAddressFormat";
  readonly address: string;
  readonly context: string;
}

export type ERC8004Error = InvalidAddressFormat;

export const InvalidAddressFormat = (
  address: string,
  context: string,
): InvalidAddressFormat => ({
  _tag: "InvalidAddressFormat",
  address,
  context,
});
