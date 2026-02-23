import type { Request, Response } from "express";
import { isAddress } from "viem";
import type { ReputationProvider } from "../erc8004/types.js";
import type { ReputationConfig } from "./types.js";

/**
 * Check reputation for a request. Returns the score if it passes the
 * threshold, or sends a 403 response and returns null.
 */
export async function checkReputation(
  req: Request,
  res: Response,
  reputationProvider: ReputationProvider,
  config: ReputationConfig,
): Promise<number | null> {
  const agentAddress = req.headers["x-agent-address"] as string | undefined;

  if (!agentAddress) {
    res.status(403).json({
      error: "Missing X-Agent-Address header",
      detail: "Reputation-gated endpoints require agent identification.",
    });
    return null;
  }

  if (!isAddress(agentAddress)) {
    res.status(400).json({
      error: "Invalid X-Agent-Address header",
      detail: "The provided address is not a valid EVM address.",
    });
    return null;
  }

  const result = await reputationProvider.getScore(
    agentAddress,
    config.tag1,
    config.tag2,
  );

  if (result.score < config.minScore) {
    res.status(403).json({
      error: "Insufficient reputation",
      detail: `Score ${result.score} is below the required minimum of ${config.minScore}.`,
      score: result.score,
      required: config.minScore,
      feedbackCount: result.feedbackCount,
    });
    return null;
  }

  return result.score;
}
