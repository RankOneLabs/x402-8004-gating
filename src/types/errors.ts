// Domain error types as discriminated unions

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
