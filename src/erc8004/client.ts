import { createPublicClient, http, getContract, type Address } from "viem";
import { baseSepolia } from "viem/chains";
import type { ReputationProvider, ReputationResult } from "./types.js";
import { identityRegistryAbi, reputationRegistryAbi } from "./abis.js";

interface ERC8004ClientConfig {
  rpcUrl: string;
  identityRegistry: string;
  reputationRegistry: string;
  /** Starting block for event scans. Defaults to 0n.
   *  Set this to avoid hitting RPC eth_getLogs range limits. */
  fromBlock?: bigint;
}

/**
 * Onchain ERC-8004 client using viem.
 * Reads reputation from Base Sepolia contracts.
 */
export class ERC8004Client implements ReputationProvider {
  private publicClient;
  private identityRegistry;
  private reputationRegistry;
  private fromBlock: bigint;

  constructor(config: ERC8004ClientConfig) {
    this.fromBlock = config.fromBlock ?? 0n;
    this.publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(config.rpcUrl),
    });

    this.identityRegistry = getContract({
      address: config.identityRegistry as Address,
      abi: identityRegistryAbi,
      client: this.publicClient,
    });

    this.reputationRegistry = getContract({
      address: config.reputationRegistry as Address,
      abi: reputationRegistryAbi,
      client: this.publicClient,
    });
  }

  /**
   * Resolve an Ethereum address to an ERC-8004 agentId by scanning
   * Registered events. Returns null if no identity found.
   */
  async resolveAgentId(ownerAddress: string): Promise<bigint | null> {
    const logs = await this.publicClient.getContractEvents({
      address: this.identityRegistry.address,
      abi: identityRegistryAbi,
      eventName: "Registered",
      args: { owner: ownerAddress as Address },
      fromBlock: this.fromBlock,
      toBlock: "latest",
    });

    if (logs.length === 0) return null;
    // Use the most recent registration
    const lastLog = logs[logs.length - 1];
    return lastLog.args.agentId ?? null;
  }

  async getScore(
    agentAddress: string,
    tag1?: string,
    tag2?: string,
  ): Promise<ReputationResult> {
    // Step 1: Resolve address → agentId
    const agentId = await this.resolveAgentId(agentAddress);
    if (agentId === null) {
      return { score: 0, feedbackCount: 0 };
    }

    // Step 2: Get all clients who submitted feedback
    const clients = await this.reputationRegistry.read.getClients([agentId]) as Address[];

    if (clients.length === 0) {
      return { score: 0, feedbackCount: 0 };
    }

    // Step 3: Get aggregated summary
    const [count, summaryValue, summaryValueDecimals] =
      await this.reputationRegistry.read.getSummary([
        agentId,
        clients,
        tag1 || "",
        tag2 || "",
      ]) as [bigint, bigint, number];

    // Step 4: Normalize to 0-100
    const rawScore = Number(summaryValue) / 10 ** summaryValueDecimals;
    const score = Math.max(0, Math.min(100, rawScore));

    return {
      score,
      feedbackCount: Number(count),
      raw: { value: summaryValue, decimals: summaryValueDecimals },
    };
  }
}
