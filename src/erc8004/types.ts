/** Normalized reputation score (0-100) */
export interface ReputationResult {
  score: number; // 0-100 normalized
  feedbackCount: number;
  raw?: { value: bigint; decimals: number }; // original chain values
}

/**
 * Abstraction over ERC-8004 reputation queries.
 * Both mock and onchain clients implement this interface.
 */
export interface ReputationProvider {
  /**
   * Get a normalized reputation score for an agent.
   * @param agentAddress - Ethereum address of the agent
   * @param tag1 - optional primary tag filter
   * @param tag2 - optional secondary tag filter
   * @returns Normalized score (0-100) and metadata
   */
  getScore(
    agentAddress: string,
    tag1?: string,
    tag2?: string,
  ): Promise<ReputationResult>;
}
