import { afterEach, describe, expect, it } from "vitest";
import {
  enemies,
  experienceOrbs,
  floaters,
  particles,
  player,
  simulationPerfConfig,
  state,
  world,
} from "../state";
import { updateExperience } from "../entities/experience";
import { burst, pulseText } from "../entities/particles";
import { nearestEnemy } from "../entities/player";
import type { EnemyEntity } from "../types";
import { swapRemove } from "../utils";
import { enemyGrid } from "./grids";
import { resetSimulation, stepSimulation } from "./simulation";
import { SpatialGrid } from "./spatial-grid";

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
});
