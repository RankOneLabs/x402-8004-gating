import { createPublicClient, http, getContract, isAddress, type Address } from "viem";
import { baseSepolia } from "viem/chains";
import type { ReputationProvider, ReputationResult } from "./types.js";
import { identityRegistryAbi, reputationRegistryAbi } from "./abis.js";
import { type Result, Ok, Err } from "../types/result.js";
import { type Option, Some, None, isNone } from "../types/option.js";
import { type ERC8004Error, InvalidAddressFormat } from "../types/errors.js";

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
    if (!isAddress(config.identityRegistry)) {
      throw new Error(`Invalid Ethereum address for identityRegistry: "${config.identityRegistry}"`);
    }
    if (!isAddress(config.reputationRegistry)) {
      throw new Error(`Invalid Ethereum address for reputationRegistry: "${config.reputationRegistry}"`);
    }

    this.fromBlock = config.fromBlock ?? 0n;
    this.publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(config.rpcUrl),
    });

    this.identityRegistry = getContract({
      address: config.identityRegistry,
      abi: identityRegistryAbi,
      client: this.publicClient,
    });

    this.reputationRegistry = getContract({
      address: config.reputationRegistry,
      abi: reputationRegistryAbi,
      client: this.publicClient,
    });
  }

  /**
   * Resolve an Ethereum address to an ERC-8004 agentId by scanning
   * Registered events. Returns Err for invalid address, Ok(None) if
   * no identity found, Ok(Some(agentId)) on success.
   */
  async resolveAgentId(ownerAddress: string): Promise<Result<Option<bigint>, ERC8004Error>> {
    if (!isAddress(ownerAddress)) {
      return Err(InvalidAddressFormat(ownerAddress, "resolveAgentId"));
    }
    const logs = await this.publicClient.getContractEvents({
      address: this.identityRegistry.address,
      abi: identityRegistryAbi,
      eventName: "Registered",
      args: { owner: ownerAddress as Address },
      fromBlock: this.fromBlock,
      toBlock: "latest",
    });

    if (logs.length === 0) return Ok(None);
    // Use the most recent registration
    const lastLog = logs[logs.length - 1];
    const agentId = lastLog.args.agentId;
    return agentId != null ? Ok(Some(agentId)) : Ok(None);
  }

  async getScore(
    agentAddress: string,
    tag1?: string,
    tag2?: string,
  ): Promise<ReputationResult> {
    // Step 1: Resolve address → agentId
    const resolved = await this.resolveAgentId(agentAddress);
    if (resolved._tag === "Err" || isNone(resolved.value)) {
      return { score: 0, feedbackCount: 0 };
    }
    const agentId = resolved.value.value;

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
