import { describe, expect, it } from "vitest";
import {
  runBalanceTrial,
  summarizeBalanceTrials,
  type BalancePersonaId,
  type BalanceSummary,
  type BalanceTrialResult,
} from "./balance-simulation";

const BALANCE_SEEDS = Array.from({ length: 24 }, (_, index) => 1109 + index * 37);

function runPersona(
  persona: BalancePersonaId,
  maxWave: number,
  maxSeconds: number,
): BalanceTrialResult[] {
  return BALANCE_SEEDS.map((seed) =>
    runBalanceTrial({
      seed,
      persona,
      maxWave,
      maxSeconds,
    }),
  );
}

function formatSummary(
  summary: BalanceSummary,
  results: BalanceTrialResult[],
): string {
  const samples = results
    .slice(0, 6)
    .map(
      (result) =>
        `${result.seed}:w${result.finalWave}/hp${result.finalHp}/t${result.timeSeconds}/${result.died ? "dead" : "alive"}`,
    )
    .join(", ");
  return [
    `${summary.persona}: ${summary.deaths}/${summary.runs} deaths`,
    `reached wave 3: ${summary.reachedWave3}/${summary.runs}`,
    `reached wave 6: ${summary.reachedWave6}/${summary.runs}`,
    `median wave=${summary.medianWave}`,
    `median hp=${summary.medianHp}`,
    `median time=${summary.medianTimeSeconds}s`,
    `samples=[${samples}]`,
  ].join("; ");
}

describe("headless early-wave balance", () => {
  it("replays the same persona and seed deterministically", () => {
    const first = runBalanceTrial({
      seed: 4242,
      persona: "kiter",
      maxWave: 4,
      maxSeconds: 100,
    });
    const second = runBalanceTrial({
      seed: 4242,
      persona: "kiter",
      maxWave: 4,
      maxSeconds: 100,
    });

    expect(second).toEqual(first);
  });

  it("rejects non-positive step durations", () => {
    expect(() =>
      runBalanceTrial({
        seed: 4242,
        persona: "idle",
        maxWave: 2,
        maxSeconds: 60,
        stepSeconds: 0,
      }),
    ).toThrow("stepSeconds");
    expect(() =>
      runBalanceTrial({
        seed: 4242,
        persona: "idle",
        maxWave: 2,
        maxSeconds: 60,
        stepSeconds: 1,
      }),
    ).toThrow("stepSeconds");
  });

  it("kills an idle player before wave 2", () => {
    const results = runPersona("idle", 2, 60);
    const summary = summarizeBalanceTrials(results);
    const message = formatSummary(summary, results);

    expect(summary.deaths, message).toBe(BALANCE_SEEDS.length);
    expect(summary.medianTimeSeconds, message).toBeLessThanOrEqual(40);
    expect(results.every((result) => result.finalWave < 2), message).toBe(true);
  });

  it("punishes a panicking player before wave 4", () => {
    const results = runPersona("panic", 4, 110);
    const summary = summarizeBalanceTrials(results);
    const punishedRuns = results.filter(
      (result) => result.died || result.finalHp < 35,
    ).length;
    const message = formatSummary(summary, results);

    expect(punishedRuns, message).toBeGreaterThanOrEqual(18);
  });

  it("lets a kiting player progress without trivializing the opening", () => {
    const results = runPersona("kiter", 6, 150);
    const summary = summarizeBalanceTrials(results);
    const message = formatSummary(summary, results);

    expect(summary.reachedWave3, message).toBeGreaterThanOrEqual(18);
    expect(summary.reachedWave6, message).toBeLessThanOrEqual(20);
  }, 30_000);
});
