import { describe, it, expect } from "vitest";
import {
  SessionUsageTracker,
  calculateTokenCost,
} from "../runtime/usage-tracker";
import type { ModelPricing } from "@cline/shared";

describe("SessionUsageTracker & Cost Calculation", () => {
  it("calculates cost accurately when pricing information is provided", () => {
    const pricing: ModelPricing = {
      input: 3.0, // $3.00 per million tokens
      output: 15.0, // $15.00 per million tokens
      cacheRead: 0.3, // $0.30 per million tokens
      cacheWrite: 3.75, // $3.75 per million tokens
    };

    const usage = {
      inputTokens: 10_000,
      outputTokens: 1_000,
      cacheReadTokens: 5_000,
      cacheWriteTokens: 2_000,
    };

    const cost = calculateTokenCost(pricing, usage);
    expect(cost).toBeDefined();

    // 10,000 * 3 / 1,000,000 = 0.03
    // 1,000 * 15 / 1,000,000 = 0.015
    // 5,000 * 0.3 / 1,000,000 = 0.0015
    // 2,000 * 3.75 / 1,000,000 = 0.0075
    // Total = 0.054
    expect(cost).toBeCloseTo(0.054, 5);
  });

  it("does not invent pricing when pricing is missing or undefined", () => {
    const usage = {
      inputTokens: 50_000,
      outputTokens: 2_000,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };

    const costWithoutPricing = calculateTokenCost(undefined, usage);
    expect(costWithoutPricing).toBeUndefined();

    const emptyPricing: ModelPricing = {};
    const costEmptyPricing = calculateTokenCost(emptyPricing, usage);
    expect(costEmptyPricing).toBeUndefined();
  });

  it("tracks session usage across multiple turns with correct accumulation", () => {
    const tracker = new SessionUsageTracker();
    const sessionId = "session_test_usage_123";

    tracker.initSession(sessionId, "anthropic", "claude-haiku-5-5");

    const pricing: ModelPricing = {
      input: 1.0,
      output: 5.0,
    };

    // Turn 1
    const turn1 = tracker.recordTurnUsage(
      sessionId,
      {
        inputTokens: 1_000,
        outputTokens: 200,
        cacheReadTokens: 500,
        cacheWriteTokens: 0,
      },
      pricing
    );

    expect(turn1.turnUsage.inputTokens).toBe(1_000);
    expect(turn1.turnUsage.outputTokens).toBe(200);
    expect(turn1.sessionUsage.totalInputTokens).toBe(1_000);
    expect(turn1.sessionUsage.totalOutputTokens).toBe(200);
    expect(turn1.sessionUsage.totalCacheReadTokens).toBe(500);

    // Turn 2
    const turn2 = tracker.recordTurnUsage(
      sessionId,
      {
        inputTokens: 2_000,
        outputTokens: 300,
        cacheReadTokens: 1_000,
        cacheWriteTokens: 500,
      },
      pricing
    );

    expect(turn2.sessionUsage.totalInputTokens).toBe(3_000);
    expect(turn2.sessionUsage.totalOutputTokens).toBe(500);
    expect(turn2.sessionUsage.totalCacheReadTokens).toBe(1_500);
    expect(turn2.sessionUsage.totalCacheWriteTokens).toBe(500);
    expect(turn2.sessionUsage.turns.length).toBe(2);
    expect(turn2.sessionUsage.totalCost).toBeDefined();
    expect(turn2.sessionUsage.totalCost).toBeGreaterThan(0);
  });
});
