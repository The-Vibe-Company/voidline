import { afterEach, describe, expect, it } from "vitest";
import {
  enemies,
  experienceOrbs,
  floaters,
  ownedRelics,
  ownedUpgrades,
  particles,
  player,
  simulationPerfConfig,
  state,
  world,
} from "../state";
import { burst, pulseText } from "../entities/particles";
import { bossBalance } from "../game/roguelike";
import type { EnemyEntity } from "../types";
import { swapRemove } from "../utils";
import { resetSimulation, startSimulationWave, stepSimulation } from "./simulation";
import {
  challengeProgress,
  initializeChallenges,
  resetChallengeProgress,
  setChallengeTrackingEnabled,
} from "../systems/challenges";
import { createDefaultAccountProgress } from "../game/account-progression";
import { accountProgress, resetAccountProgress, restoreAccountProgress } from "../systems/account";

const defaultParticleBudget = simulationPerfConfig.budgets.maxParticles;
const defaultFloaterBudget = simulationPerfConfig.budgets.maxFloaters;
const defaultDamageTextBudget = simulationPerfConfig.budgets.maxDamageTexts;

function makeEnemy(id: number, x: number, y: number): EnemyEntity {
  return {
    id,
    kind: "scout",
    score: 35,
    radius: 14,
    hp: 30,
    maxHp: 30,
    speed: 0,
    damage: 0,
    color: "#ff5a69",
    accent: "#ffd0d5",
    sides: 3,
    x,
    y,
    age: 0,
    seed: 0,
    wobble: 0,
    wobbleRate: 0,
    hit: 0,
  };
}

function completeCurrentWave(): void {
  startSimulationWave(state.wave + 1);
}

function prepareWorld(): void {
  world.width = 1280;
  world.height = 720;
  world.arenaWidth = 3200;
  world.arenaHeight = 2200;
  world.cameraX = 0;
  world.cameraY = 0;
  world.time = 0;
  world.shake = 0;
  enemies.length = 0;
  particles.length = 0;
  floaters.length = 0;
  experienceOrbs.length = 0;
  player.x = world.arenaWidth / 2;
  player.y = world.arenaHeight / 2;
  state.mode = "playing";
}

afterEach(() => {
  resetChallengeProgress(null);
  resetAccountProgress(null);
  setChallengeTrackingEnabled(true);
  simulationPerfConfig.budgets.maxParticles = defaultParticleBudget;
  simulationPerfConfig.budgets.maxFloaters = defaultFloaterBudget;
  simulationPerfConfig.budgets.maxDamageTexts = defaultDamageTextBudget;
  prepareWorld();
});

describe("simulation performance helpers", () => {
  it("swap-removes without losing an active item", () => {
    const items = ["a", "b", "c", "d"];
    const removed = swapRemove(items, 1);

    expect(removed).toBe("b");
    expect(items).toHaveLength(3);
    expect(new Set(items)).toEqual(new Set(["a", "c", "d"]));
  });

  it("caps transient particles and floaters at the configured budgets", () => {
    prepareWorld();
    simulationPerfConfig.budgets.maxParticles = 6;
    simulationPerfConfig.budgets.maxFloaters = 2;

    burst(100, 100, "#ffffff", 30, 100);
    pulseText(100, 100, "A", "#ffffff");
    pulseText(100, 100, "B", "#ffffff");
    pulseText(100, 100, "C", "#ffffff");

    expect(particles).toHaveLength(6);
    expect(floaters).toHaveLength(2);
  });

  it("tracks damage text budget separately from other floaters", () => {
    prepareWorld();
    simulationPerfConfig.budgets.maxFloaters = 4;
    simulationPerfConfig.budgets.maxDamageTexts = 1;

    pulseText(100, 100, "LEVEL", "#ffffff");
    pulseText(100, 100, "12", "#ff5a69", true);
    pulseText(100, 100, "14", "#ff5a69", true);

    expect(floaters.map((floater) => floater.text)).toEqual(["LEVEL", "12"]);
    expect(floaters.filter((floater) => floater.damageText)).toHaveLength(1);
  });

  it("replays seeded simulation spawns deterministically", () => {
    prepareWorld();
    const snapshot = (seed: number): string[] => {
      resetSimulation(seed);
      state.spawnTimer = 0;
      state.spawnRemaining = 4;
      stepSimulation(1 / 60);
      return enemies.map((enemy) =>
        [enemy.kind, enemy.x.toFixed(2), enemy.y.toFixed(2)].join(":"),
      );
    };

    expect(snapshot(123)).toEqual(snapshot(123));
  });

  it("clears queued chest rewards when a run resets", () => {
    prepareWorld();
    state.pendingChests = 2;

    resetSimulation(123);

    expect(state.pendingChests).toBe(0);
  });

  it("pauses combat and stage timers while upgrade or chest choices are pending", () => {
    prepareWorld();
    resetSimulation(123);
    enemies.length = 0;
    state.spawnTimer = 0;
    state.spawnRemaining = 4;
    state.stageElapsedSeconds = bossBalance.stageDurationSeconds - 0.01;
    state.mode = "upgrade";
    state.pendingUpgrades = 1;

    stepSimulation(0.02);

    expect(state.stageElapsedSeconds).toBeCloseTo(bossBalance.stageDurationSeconds - 0.01);
    expect(state.spawnRemaining).toBe(4);
    expect(enemies).toHaveLength(0);
    expect(state.stageBossActive).toBe(false);
  });

  it("starts from the selected unlocked stage without granting extra power", () => {
    prepareWorld();
    restoreAccountProgress({
      ...createDefaultAccountProgress(),
      highestStageCleared: 1,
      highestStartStageUnlocked: 2,
      selectedStartStage: 2,
    });

    resetSimulation(123);

    expect(state.stage).toBe(2);
    expect(state.startStage).toBe(2);
    expect(state.wave).toBe(10);
    expect(player.damage).toBe(24);
    expect(player.projectileCount).toBe(1);
  });

  it("clamps a mutated selected start stage at reset", () => {
    prepareWorld();
    restoreAccountProgress(createDefaultAccountProgress());
    accountProgress.selectedStartStage = 99;
    accountProgress.highestStartStageUnlocked = 1;

    resetSimulation(123);

    expect(state.stage).toBe(1);
    expect(state.wave).toBe(1);
  });

  it("keeps Rust as the source of truth when TS state is mutated directly", () => {
    prepareWorld();
    resetSimulation(123);
    enemies.length = 0;
    state.stageElapsedSeconds = bossBalance.stageDurationSeconds - 0.01;
    state.stageBossActive = true;
    enemies.push(makeEnemy(99, player.x + 100, player.y));

    stepSimulation(0.02);

    expect(state.stageElapsedSeconds).toBeCloseTo(0.02);
    expect(state.stageBossActive).toBe(false);
    expect(enemies.some((enemy) => enemy.id === 99)).toBe(false);
  });

  it("applies the equipped account weapon when a run resets", () => {
    prepareWorld();
    restoreAccountProgress({
      ...createDefaultAccountProgress(),
      purchasedUnlockIds: ["weapon:lance"],
      selectedWeaponId: "lance",
    });

    resetSimulation(123);

    expect(player.pierce).toBe(1);
    expect(player.damage).toBeGreaterThan(24);
    expect(player.fireRate).toBeLessThan(3);

    player.pierce = 0;
    player.damage = 1;
    resetSimulation(123);

    expect(player.pierce).toBe(1);
    expect(player.damage).toBeGreaterThan(24);
  });

  it("keeps run upgrades and relics reset while account weapon persists", () => {
    prepareWorld();
    restoreAccountProgress({
      ...createDefaultAccountProgress(),
      purchasedUnlockIds: ["weapon:scatter"],
      selectedWeaponId: "scatter",
    });
    ownedUpgrades.set("fake", {
      upgrade: {
        id: "fake",
        kind: "technology",
        icon: "F",
        name: "Fake",
        description: "Fake",
        tags: ["cannon"],
        effect: () => "Fake",
        apply: () => undefined,
        effects: [],
      },
      tier: {
        id: "standard",
        short: "T1",
        name: "Standard",
        power: 1,
        color: "#39d9ff",
        glow: "rgba(57, 217, 255, 0.22)",
      },
      count: 1,
    });
    ownedRelics.set("fake", {
      relic: {
        id: "fake",
        icon: "F",
        name: "Fake",
        description: "Fake",
        tags: ["salvage"],
        color: "#ffffff",
        effect: "Fake",
        apply: () => undefined,
        effects: [],
      },
      count: 1,
    });
    player.traits = {
      railSplitter: true,
      droneSwarm: true,
      kineticRam: true,
      magnetStorm: true,
    };
    player.ramTimer = 1;
    player.magnetStormCharge = 40;
    player.magnetStormTimer = 2;

    resetSimulation(123);

    expect(player.projectileCount).toBe(2);
    expect(ownedUpgrades.size).toBe(0);
    expect(ownedRelics.size).toBe(0);
    expect(player.traits).toEqual({
      railSplitter: false,
      droneSwarm: false,
      kineticRam: false,
      magnetStorm: false,
    });
    expect(player.ramTimer).toBe(0);
    expect(player.magnetStormCharge).toBe(0);
    expect(player.magnetStormTimer).toBe(0);
  });

  it("records wave challenge metrics from Rust wave transitions", () => {
    prepareWorld();
    resetChallengeProgress(null);
    initializeChallenges(null);
    state.wave = 3;
    state.score = 0;
    state.level = 1;
    state.xp = 0;
    state.xpTarget = 1;

    startSimulationWave(5);
    expect(challengeProgress.bestWave).toBe(0);
    completeCurrentWave();
    expect(challengeProgress.bestWave).toBe(5);
  });

  it("records best-wave challenges relative to the selected start stage", () => {
    prepareWorld();
    resetChallengeProgress(null);
    initializeChallenges(null);
    restoreAccountProgress({
      ...createDefaultAccountProgress(),
      highestStageCleared: 1,
      highestStartStageUnlocked: 2,
      selectedStartStage: 2,
    });

    resetSimulation(123);

    expect(state.wave).toBe(10);
    expect(challengeProgress.bestWave).toBe(0);
    completeCurrentWave();
    expect(challengeProgress.bestWave).toBe(1);
  });
});
