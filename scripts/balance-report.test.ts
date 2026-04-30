import { it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  type BalancePersonaId,
  type BalanceTrialResult,
  runBalanceTrial,
} from "../src/game/balance-simulation";

const RUN = process.env.RUN_BALANCE_REPORT === "1";

const PERSONAS: BalancePersonaId[] = ["kiter", "optimizer", "randomized"];
const SEEDS = [101, 211, 313, 419, 523, 631, 727, 829, 941, 1049];
const BUILD_SEEDS = [7, 13, 19, 23, 29];
const MAX_WAVE = 10;
const MAX_SECONDS = 120;

it.skipIf(!RUN)(
  "emits scripts/balance-report.json",
  () => {
    const all: BalanceTrialResult[] = [];
    for (const persona of PERSONAS) {
      for (const seed of SEEDS) {
        for (const buildSeed of BUILD_SEEDS) {
          all.push(
            runBalanceTrial({
              seed,
              persona,
              maxWave: MAX_WAVE,
              maxSeconds: MAX_SECONDS,
              buildSeed,
              randomBuildPicks: persona === "randomized" ? 0 : 3,
            }),
          );
        }
      }
    }

    const report = buildReport(all);
    const outPath = path.join(process.cwd(), "scripts", "balance-report.json");
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(`balance-report: ${all.length} trials → ${outPath}`);
  },
  10 * 60 * 1000,
);

interface ReportPersonaSection {
  persona: BalancePersonaId;
  runs: number;
  deathRate: number;
  medianWave: number;
  medianTimeSeconds: number;
  medianKills: number;
  medianScore: number;
  waveDistribution: Record<string, number>;
  buildTagShare: Record<string, number>;
  upgradeTierShare: Record<string, number>;
  killShareByEnemy: Record<string, number>;
  synergyActivationRate: Record<string, number>;
  bossesDefeatedAvg: number;
}

function buildReport(results: BalanceTrialResult[]) {
  const byPersona = new Map<BalancePersonaId, BalanceTrialResult[]>();
  for (const result of results) {
    const arr = byPersona.get(result.persona) ?? [];
    arr.push(result);
    byPersona.set(result.persona, arr);
  }

  const sections: ReportPersonaSection[] = [];
  for (const [persona, runs] of byPersona) {
    sections.push(summarize(persona, runs));
  }

  return {
    generatedAt: new Date().toISOString(),
    totalRuns: results.length,
    config: { personas: PERSONAS, seeds: SEEDS, buildSeeds: BUILD_SEEDS, maxWave: MAX_WAVE, maxSeconds: MAX_SECONDS },
    sections,
  };
}

function summarize(persona: BalancePersonaId, runs: BalanceTrialResult[]): ReportPersonaSection {
  const deathRate = runs.filter((r) => r.died).length / runs.length;
  const waves = runs.map((r) => r.finalWave).sort((a, b) => a - b);
  const times = runs.map((r) => r.timeSeconds).sort((a, b) => a - b);
  const kills = runs.map((r) => r.kills).sort((a, b) => a - b);
  const scores = runs.map((r) => r.score).sort((a, b) => a - b);

  const waveDistribution: Record<string, number> = {};
  for (const r of runs) {
    const key = String(r.finalWave);
    waveDistribution[key] = (waveDistribution[key] ?? 0) + 1;
  }

  const tagTotals: Record<string, number> = {};
  let tagCountAll = 0;
  for (const r of runs) {
    for (const [tag, count] of Object.entries(r.upgradesByTag)) {
      tagTotals[tag] = (tagTotals[tag] ?? 0) + count;
      tagCountAll += count;
    }
  }
  const buildTagShare: Record<string, number> = {};
  for (const [tag, total] of Object.entries(tagTotals)) {
    buildTagShare[tag] = tagCountAll > 0 ? total / tagCountAll : 0;
  }

  const tierTotals: Record<string, number> = {};
  let tierCountAll = 0;
  for (const r of runs) {
    for (const [tier, count] of Object.entries(r.upgradesByTier)) {
      tierTotals[tier] = (tierTotals[tier] ?? 0) + count;
      tierCountAll += count;
    }
  }
  const upgradeTierShare: Record<string, number> = {};
  for (const [tier, total] of Object.entries(tierTotals)) {
    upgradeTierShare[tier] = tierCountAll > 0 ? total / tierCountAll : 0;
  }

  const killTotals: Record<string, number> = {};
  let killAll = 0;
  for (const r of runs) {
    for (const [kind, count] of Object.entries(r.killsByKind)) {
      killTotals[kind] = (killTotals[kind] ?? 0) + count;
      killAll += count;
    }
  }
  const killShareByEnemy: Record<string, number> = {};
  for (const [kind, total] of Object.entries(killTotals)) {
    killShareByEnemy[kind] = killAll > 0 ? total / killAll : 0;
  }

  const synergyActivationRate: Record<string, number> = {};
  for (const r of runs) {
    for (const id of r.synergiesActivated) {
      synergyActivationRate[id] = (synergyActivationRate[id] ?? 0) + 1;
    }
  }
  for (const id of Object.keys(synergyActivationRate)) {
    synergyActivationRate[id] = synergyActivationRate[id]! / runs.length;
  }

  const bossesDefeatedAvg =
    runs.reduce((sum, r) => sum + r.bossesDefeatedWaves.length, 0) / runs.length;

  return {
    persona,
    runs: runs.length,
    deathRate,
    medianWave: median(waves),
    medianTimeSeconds: median(times),
    medianKills: median(kills),
    medianScore: median(scores),
    waveDistribution,
    buildTagShare,
    upgradeTierShare,
    killShareByEnemy,
    synergyActivationRate,
    bossesDefeatedAvg,
  };
}

function median(sorted: number[]): number {
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle]!;
  return (sorted[middle - 1]! + sorted[middle]!) / 2;
}
