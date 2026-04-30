import { afterEach, describe, expect, it } from "vitest";
import { keys, pointer, state } from "../state";
import {
  challengeProgress,
  initializeChallenges,
  recordChallengeProgress,
  setChallengeTrackingEnabled,
  resetChallengeProgress,
} from "../systems/challenges";
import {
  runBalanceTrial,
  summarizeBalanceTrials,
  type BalancePersonaId,
  type BalanceSummary,
  type BalanceTrialResult,
} from "./balance-simulation";

const BALANCE_SEEDS = Array.from({ length: 24 }, (_, index) => 1109 + index * 37);
const FAST_BALANCE_SEEDS = BALANCE_SEEDS.slice(0, 12);

function runPersona(
  persona: BalancePersonaId,
  maxWave: number,
  maxSeconds: number,
  seeds = BALANCE_SEEDS,
): BalanceTrialResult[] {
  return seeds.map((seed) =>
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
    `median level=${summary.medianLevel}`,
    `wave variance=${summary.waveVariance}`,
    `hp variance=${summary.hpVariance}`,
    `samples=[${samples}]`,
  ].join("; ");
}

function syntheticResult(
  overrides: Partial<BalanceTrialResult>,
): BalanceTrialResult {
  return {
    seed: 1,
    persona: "optimizer",
    died: false,
    timeSeconds: 0,
    finalWave: 1,
    finalHp: 100,
    lowestHp: 100,
    kills: 0,
    level: 1,
    score: 0,
    upgradesApplied: 0,
    killsByKind: { scout: 0, hunter: 0, brute: 0 },
    upgradesByTag: { cannon: 0, crit: 0, pierce: 0, drone: 0, shield: 0, magnet: 0, salvage: 0 },
    upgradesByTier: { standard: 0, rare: 0, prototype: 0, singularity: 0 },
    bossesDefeatedWaves: [],
    bossesDefeatedStages: [],
    synergiesActivated: [],
    ...overrides,
  };
}

describe("headless early-wave balance", () => {
  afterEach(() => {
    keys.clear();
    pointer.inside = false;
    state.controlMode = "keyboard";
    resetChallengeProgress(null);
    setChallengeTrackingEnabled(true);
  });

  it("replays the same persona and seed deterministically", () => {
    const first = runBalanceTrial({
      seed: 4242,
      persona: "optimizer",
      maxWave: 4,
      maxSeconds: 100,
    });
    const second = runBalanceTrial({
      seed: 4242,
      persona: "optimizer",
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
      (result) => result.finalWave < 4 && (result.died || result.finalHp < 35),
    ).length;
    const message = formatSummary(summary, results);

    expect(punishedRuns, message).toBeGreaterThanOrEqual(18);
  });

  it("lets a kiting player progress without trivializing the opening", () => {
    const results = runPersona("kiter", 6, 150);
    const summary = summarizeBalanceTrials(results);
    const message = formatSummary(summary, results);

    // Baseline measured with account/challenge tracking isolated from headless trials.
    expect(summary.reachedWave3, message).toBeGreaterThanOrEqual(15);
    expect(summary.reachedWave6, message).toBeLessThanOrEqual(20);
  }, 30_000);

  it("summarizes balance trial metrics exactly for CI reporting", () => {
    const summary = summarizeBalanceTrials([
      syntheticResult({
        seed: 1,
        died: true,
        finalWave: 2,
        finalHp: 0,
        timeSeconds: 50,
        level: 1,
      }),
      syntheticResult({
        seed: 2,
        died: true,
        finalWave: 4,
        finalHp: 10,
        timeSeconds: 70,
        level: 2,
      }),
      syntheticResult({
        seed: 3,
        finalWave: 4,
        finalHp: 30,
        timeSeconds: 90,
        level: 3,
      }),
      syntheticResult({
        seed: 4,
        finalWave: 8,
        finalHp: 60,
        timeSeconds: 110,
        level: 6,
      }),
    ]);

    expect(summary).toMatchObject({
      persona: "optimizer",
      runs: 4,
      deaths: 2,
      deathRate: 0.5,
      reachedWave3: 3,
      reachedWave6: 1,
      medianWave: 4,
      medianHp: 20,
      medianTimeSeconds: 80,
      medianLevel: 2.5,
      waveVariance: 4.75,
      hpVariance: 525,
    });
  });

  it("reports CI-oriented balance summary metrics", () => {
    const results = runPersona("optimizer", 5, 130, FAST_BALANCE_SEEDS);
    const summary = summarizeBalanceTrials(results);
    const message = formatSummary(summary, results);

    expect(summary.deathRate, message).toBeGreaterThanOrEqual(0);
    expect(summary.deathRate, message).toBeLessThanOrEqual(1);
    expect(summary.medianLevel, message).toBeGreaterThanOrEqual(1);
    expect(summary.waveVariance, message).toBeGreaterThanOrEqual(0);
    expect(summary.hpVariance, message).toBeGreaterThanOrEqual(0);
  }, 30_000);

  it("lets the optimizer outperform panic movement", () => {
    const panicResults = runPersona("panic", 4, 110, FAST_BALANCE_SEEDS);
    const optimizerResults = runPersona("optimizer", 4, 110, FAST_BALANCE_SEEDS);
    const panicSummary = summarizeBalanceTrials(panicResults);
    const optimizerSummary = summarizeBalanceTrials(optimizerResults);
    const message = [
      formatSummary(panicSummary, panicResults),
      formatSummary(optimizerSummary, optimizerResults),
    ].join(" | ");

    expect(optimizerSummary.reachedWave3, message).toBeGreaterThan(
      panicSummary.reachedWave3,
    );
    expect(optimizerSummary.medianWave, message).toBeGreaterThanOrEqual(
      panicSummary.medianWave,
    );
  }, 30_000);

  it("keeps the optimizer from trivializing early waves", () => {
    const results = runPersona("optimizer", 7, 190, FAST_BALANCE_SEEDS);
    const summary = summarizeBalanceTrials(results);
    const message = formatSummary(summary, results);

    expect(summary.reachedWave3, message).toBeGreaterThanOrEqual(8);
    expect(summary.reachedWave6, message).toBeLessThanOrEqual(11);
  }, 30_000);

  it("restores challenge progress and tracking after headless trials", () => {
    resetChallengeProgress(null);
    initializeChallenges(null);
    recordChallengeProgress("bestWave", 20, null);
    setChallengeTrackingEnabled(true);

    runBalanceTrial({
      seed: 4242,
      persona: "idle",
      maxWave: 2,
      maxSeconds: 20,
    });

    expect(challengeProgress.bestWave).toBe(20);
    recordChallengeProgress("bestScore", 2_000, null);
    expect(challengeProgress.bestScore).toBe(2_000);
  });

  it("restores input state after optimizer headless trials", () => {
    keys.clear();
    keys.add("KeyA");
    pointer.x = 321;
    pointer.y = 654;
    pointer.inside = true;
    state.controlMode = "trackpad";

    runBalanceTrial({
      seed: 4242,
      persona: "optimizer",
      maxWave: 3,
      maxSeconds: 60,
    });

    expect([...keys]).toEqual(["KeyA"]);
    expect(pointer).toMatchObject({
      x: 321,
      y: 654,
      inside: true,
    });
    expect(state.controlMode).toBe("trackpad");
  });
});

describe("randomized persona explores the build space (fully unlocked account)", () => {
  function explore(): BalanceTrialResult[] {
    return FAST_BALANCE_SEEDS.flatMap((seed) =>
      [7, 13, 19].map((buildSeed) =>
        runBalanceTrial({
          seed,
          persona: "randomized",
          maxWave: 8,
          maxSeconds: 220,
          buildSeed,
          fullyUnlocked: true,
        }),
      ),
    );
  }

  it("activates at least one synergy in a meaningful share of seeds", () => {
    const results = explore();
    const totalRuns = results.length;
    const runsWithSynergy = results.filter((r) => r.synergiesActivated.length > 0).length;
    expect(totalRuns).toBeGreaterThan(0);
    expect(runsWithSynergy / totalRuns).toBeGreaterThanOrEqual(0.05);
  }, 60_000);

  it("keeps a healthy majority of tags reachable across explored builds (pierce/drone are weapon-locked, so excluded)", () => {
    const results = explore();
    const totals: Record<string, number> = {};
    let total = 0;
    for (const r of results) {
      for (const [tag, count] of Object.entries(r.upgradesByTag)) {
        totals[tag] = (totals[tag] ?? 0) + count;
        total += count;
      }
    }
    expect(total).toBeGreaterThan(0);
    const tagsWithSomeUsage = Object.values(totals).filter((count) => count > 0).length;
    expect(tagsWithSomeUsage).toBeGreaterThanOrEqual(4);
  }, 60_000);
});
