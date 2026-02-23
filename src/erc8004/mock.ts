import type { ReputationProvider, ReputationResult } from "./types.js";

interface MockEntry {
  score: number;
  feedbackCount: number;
}

/**
 * Mock ERC-8004 reputation client for local development.
 * Stores configurable scores keyed by address.
 */
export class MockERC8004Client implements ReputationProvider {
  private scores: Map<string, MockEntry>;

  constructor(initialScores?: Record<string, number>) {
    this.scores = new Map();
    if (initialScores) {
      for (const [addr, score] of Object.entries(initialScores)) {
        this.scores.set(addr.toLowerCase(), {
          score: Math.max(0, Math.min(100, score)),
          feedbackCount: 5, // default mock feedback count
        });
      }
    }
  }

  /** Set a mock score for an address */
  setScore(address: string, score: number, feedbackCount = 5): void {
    this.scores.set(address.toLowerCase(), {
      score: Math.max(0, Math.min(100, score)),
      feedbackCount,
    });
  }

  async getScore(
    agentAddress: string,
    _tag1?: string,
    _tag2?: string,
  ): Promise<ReputationResult> {
    const entry = this.scores.get(agentAddress.toLowerCase());
    if (!entry) {
      return { score: 0, feedbackCount: 0 };
    }
    return { score: entry.score, feedbackCount: entry.feedbackCount };
  }
}
