import type { ModelPricing } from "@cline/shared";
import { Logger } from "../utils/logger";

export interface TurnTokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cost?: number;
}

export interface SessionUsageState {
  sessionId: string;
  providerId: string;
  modelId: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheWriteTokens: number;
  totalCost?: number;
  turns: TurnTokenUsage[];
}

export function calculateTokenCost(
  pricing: ModelPricing | undefined,
  usage: {
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  }
): number | undefined {
  if (!pricing) return undefined;

  let total = 0;
  let hasValidPricing = false;

  const inputPrice = pricing.input;
  const outputPrice = pricing.output;
  const cacheReadPrice = pricing.cacheRead;
  const cacheWritePrice = pricing.cacheWrite;

  if (typeof inputPrice === "number" && typeof usage.inputTokens === "number") {
    total += (usage.inputTokens * inputPrice) / 1_000_000;
    hasValidPricing = true;
  }

  if (typeof outputPrice === "number" && typeof usage.outputTokens === "number") {
    total += (usage.outputTokens * outputPrice) / 1_000_000;
    hasValidPricing = true;
  }

  if (typeof cacheReadPrice === "number" && typeof usage.cacheReadTokens === "number") {
    total += (usage.cacheReadTokens * cacheReadPrice) / 1_000_000;
    hasValidPricing = true;
  }

  if (typeof cacheWritePrice === "number" && typeof usage.cacheWriteTokens === "number") {
    total += (usage.cacheWriteTokens * cacheWritePrice) / 1_000_000;
    hasValidPricing = true;
  }

  return hasValidPricing ? total : undefined;
}

export class SessionUsageTracker {
  private readonly sessions = new Map<string, SessionUsageState>();
  private readonly logger: Logger;

  constructor(logger?: Logger) {
    this.logger = (logger ?? new Logger("sidecar")).child("usage-tracker");
  }

  public initSession(sessionId: string, providerId: string, modelId: string): SessionUsageState {
    const state: SessionUsageState = {
      sessionId,
      providerId,
      modelId,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheReadTokens: 0,
      totalCacheWriteTokens: 0,
      totalCost: undefined,
      turns: [],
    };
    this.sessions.set(sessionId, state);
    return state;
  }

  public recordTurnUsage(
    sessionId: string,
    usage: {
      inputTokens?: number;
      outputTokens?: number;
      cacheReadTokens?: number;
      cacheWriteTokens?: number;
      cost?: number;
    },
    pricing?: ModelPricing
  ): {
    turnUsage: TurnTokenUsage;
    sessionUsage: SessionUsageState;
  } {
    let state = this.sessions.get(sessionId);
    if (!state) {
      state = this.initSession(sessionId, "unknown", "unknown");
    }

    const inputTokens = usage.inputTokens ?? 0;
    const outputTokens = usage.outputTokens ?? 0;
    const cacheReadTokens = usage.cacheReadTokens ?? 0;
    const cacheWriteTokens = usage.cacheWriteTokens ?? 0;

    // Use reported cost if provided by provider/SDK, otherwise calculate from catalog pricing
    let turnCost = usage.cost;
    if (turnCost === undefined && pricing) {
      turnCost = calculateTokenCost(pricing, {
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheWriteTokens,
      });
    }

    const turnUsage: TurnTokenUsage = {
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      cost: turnCost,
    };

    state.turns.push(turnUsage);
    state.totalInputTokens += inputTokens;
    state.totalOutputTokens += outputTokens;
    state.totalCacheReadTokens += cacheReadTokens;
    state.totalCacheWriteTokens += cacheWriteTokens;

    if (turnCost !== undefined) {
      state.totalCost = (state.totalCost ?? 0) + turnCost;
    }

    return { turnUsage, sessionUsage: { ...state } };
  }

  public getSessionUsage(sessionId: string): SessionUsageState | undefined {
    return this.sessions.get(sessionId);
  }

  public clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
