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
import { updateExperience } from "../entities/experience";
import { burst, pulseText } from "../entities/particles";
import { nearestEnemy } from "../entities/player";
import { killEnemy } from "../entities/enemies";
import { balance } from "../game/balance";
import { collectExperience } from "../game/progression";
import { bossBalance } from "../game/roguelike";
import type { EnemyEntity } from "../types";
import { swapRemove } from "../utils";
import { enemyGrid } from "./grids";
import { resetSimulation, startSimulationWave, stepSimulation } from "./simulation";
import { SpatialGrid } from "./spatial-grid";
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
  state.spawnRemaining = 0;
  state.miniBossPending = false;
  state.waveDelay = 0;
  enemies.length = 0;
  const frames = Math.ceil((balance.wave.waveDelay + 0.1) / 0.033);
  for (let i = 0; i < frames; i += 1) {
    stepSimulation(0.033);
  }
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

  it("queries nearby entities through the spatial grid", () => {
    const grid = new SpatialGrid<EnemyEntity>(64);
    const near = makeEnemy(1, 100, 100);
    const far = makeEnemy(2, 900, 900);
    grid.rebuild([near, far]);

    expect(grid.nearest(110, 110, 120)?.id).toBe(1);
    expect(grid.nearest(110, 110, 40)?.id).toBe(1);
    expect(grid.nearest(110, 110, 8)).toBeNull();
  });

  it("uses the enemy grid for auto-aim target lookup", () => {
    prepareWorld();
    const near = makeEnemy(1, player.x + 80, player.y);
    const far = makeEnemy(2, player.x + 600, player.y);
    enemies.push(far, near);
    enemyGrid.rebuild(enemies);

    expect(nearestEnemy(player.x, player.y)?.id).toBe(1);
  });

  it("expands auto-aim search when dense enemies are outside the first radius", () => {
    prepareWorld();
    const farTarget = makeEnemy(150, player.x + 1300, player.y);
    for (let i = 0; i < 149; i += 1) {
      enemies.push(makeEnemy(i + 1, 120, 120 + i));
    }
    enemies.push(farTarget);
    enemyGrid.rebuild(enemies);

    expect(nearestEnemy(player.x, player.y)?.id).toBe(150);
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

  it("uses the experience grid for dense loose-orb pickup checks", () => {
    prepareWorld();
    state.xp = 0;
    for (let i = 0; i < 80; i += 1) {
      experienceOrbs.push({
        id: i + 1,
        x: 100 + i,
        y: 100,
        vx: 0,
        vy: 0,
        radius: 6,
        value: 1,
        age: 0,
        magnetized: false,
      });
    }
    experienceOrbs.push({
      id: 999,
      x: player.x,
      y: player.y,
      vx: 0,
      vy: 0,
      radius: 6,
      value: 5,
      age: 0,
      magnetized: false,
    });

    updateExperience(1 / 60);

    expect(experienceOrbs.some((orb) => orb.id === 999)).toBe(false);
    expect(state.xp).toBe(5);
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

  it("spawns a stage boss after ten minutes of stage time", () => {
    prepareWorld();
    resetSimulation(123);
    enemies.length = 0;
    state.waveKills = 2;
    state.waveTarget = 10;
    state.spawnRemaining = 4;
    state.stageElapsedSeconds = bossBalance.stageDurationSeconds - 0.01;

    stepSimulation(0.02);

    expect(state.stageBossActive).toBe(true);
    expect(state.spawnRemaining).toBe(0);
    expect(state.waveTarget).toBe(3);
    expect(enemies.some((enemy) => enemy.role === "boss")).toBe(true);
  });

  it("does not spawn a second stage boss while a boss is alive", () => {
    prepareWorld();
    resetSimulation(123);
    enemies.length = 0;
    const boss = makeEnemy(99, player.x + 100, player.y);
    boss.role = "boss";
    enemies.push(boss);
    state.spawnRemaining = 0;
    state.stageElapsedSeconds = bossBalance.stageDurationSeconds - 0.01;

    stepSimulation(0.02);

    expect(enemies.filter((enemy) => enemy.role === "boss")).toHaveLength(1);
    expect(state.stageBossSpawned).toBe(false);
  });

  it("cancels pending mini-boss spawns when the stage boss phase starts", () => {
    prepareWorld();
    resetSimulation(123);
    enemies.length = 0;
    state.miniBossPending = true;
    state.stageElapsedSeconds = bossBalance.stageDurationSeconds - 0.01;

    stepSimulation(0.02);

    expect(state.miniBossPending).toBe(false);
    expect(enemies.filter((enemy) => enemy.role === "mini-boss")).toHaveLength(0);
    expect(enemies.filter((enemy) => enemy.role === "boss")).toHaveLength(1);
  });

  it("starts the first wave of the next stage after a boss clear", () => {
    prepareWorld();
    resetSimulation(123);
    const boss = makeEnemy(99, player.x + 100, player.y);
    boss.role = "boss";
    enemies.push(boss);

    killEnemy(enemies.length - 1);
    enemies.length = 0;
    state.spawnRemaining = 0;
    state.waveDelay = balance.wave.waveDelay + 0.01;
    stepSimulation(0.02);

    expect(state.stage).toBe(2);
    expect(state.wave).toBe(10);
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

  it("records gameplay challenge metrics from waves, kills, bosses, and XP", () => {
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

    enemies.push(makeEnemy(1, player.x + 100, player.y));
    killEnemy(enemies.length - 1);
    expect(challengeProgress.totalKills).toBe(1);
    expect(challengeProgress.bestScore).toBeGreaterThan(0);

    const boss = makeEnemy(2, player.x + 120, player.y);
    boss.role = "boss";
    enemies.push(boss);
    killEnemy(enemies.length - 1);
    expect(challengeProgress.bossKills).toBe(1);
    expect(state.runBossStages).toEqual([1]);
    expect(state.stage).toBe(2);

    collectExperience(1);
    expect(challengeProgress.bestLevel).toBe(2);
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
