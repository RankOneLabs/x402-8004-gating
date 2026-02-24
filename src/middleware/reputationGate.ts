import { isAddress } from "viem";
import type { ReputationProvider } from "../erc8004/types.js";
import type { ReputationConfig } from "./types.js";
import { type Result, Ok, Err } from "../types/result.js";
import {
  type ReputationGateError,
  MissingAgentAddress,
  InvalidAgentAddress,
  InsufficientReputation,
} from "../types/errors.js";

/**
 * Pure reputation validator — no req/res dependency.
 * Returns Ok(score) when the agent passes the threshold,
 * or Err(ReputationGateError) describing why it failed.
 */
export const validateReputation = async (
  agentAddress: string | undefined,
  reputationProvider: ReputationProvider,
  config: ReputationConfig,
): Promise<Result<number, ReputationGateError>> => {
  if (!agentAddress) return Err(MissingAgentAddress);

  if (!isAddress(agentAddress)) return Err(InvalidAgentAddress(agentAddress));

  const result = await reputationProvider.getScore(
    agentAddress,
    config.tag1,
    config.tag2,
  );

  if (result.score < config.minScore) {
    return Err(InsufficientReputation(result.score, config.minScore, result.feedbackCount));
  }

  return Ok(result.score);
};
