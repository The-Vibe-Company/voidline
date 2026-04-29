import { beforeEach, describe, expect, it } from "vitest";
import {
  bullets,
  enemies,
  experienceOrbs,
  floaters,
  particles,
  player,
  powerupOrbs,
  state,
  world,
} from "../state";
import { scoreAward } from "../game/balance";
import { bossVisualForVariant, bossVisuals } from "../game/boss-visuals";
import { clearEntityPools, resetEntityCounters } from "../simulation/pools";
import { setSimulationSeed } from "../simulation/random";
import type { EnemyEntity } from "../types";
import { killEnemy, spawnWaveBoss, updateEnemies } from "./enemies";

function makeEnemy(id: number, score = 35): EnemyEntity {
  return {
    id,
    kind: "scout",
    score,
    radius: 14,
    hp: 30,
    maxHp: 30,
    speed: 0,
    damage: 0,
    color: "#ff5a69",
    accent: "#ffd0d5",
    sides: 3,
    x: player.x + id * 10,
    y: player.y,
    age: 0,
    seed: 0,
    wobble: 0,
    wobbleRate: 0,
    hit: 0,
  };
}

function resetWorld(): void {
  setSimulationSeed(42);
  clearEntityPools();
  resetEntityCounters();

  world.width = 1280;
  world.height = 720;
  world.arenaWidth = 3200;
  world.arenaHeight = 2200;
  world.cameraX = 0;
  world.cameraY = 0;
  world.time = 0;
  world.shake = 0;
  player.x = world.arenaWidth / 2;
  player.y = world.arenaHeight / 2;
  player.radius = 18;
  player.hp = 100;
  player.maxHp = 100;
  player.damage = 24;
  player.speed = 265;
  player.vx = 0;
  player.vy = 0;
  player.shield = 0;
  player.shieldMax = 0;
  player.traits = {
    railSplitter: false,
    droneSwarm: false,
    kineticRam: false,
    magnetStorm: false,
  };
  player.ramTimer = 0;
  player.magnetStormCharge = 0;
  player.magnetStormTimer = 0;
  state.mode = "playing";
  state.wave = 3;
  state.score = 0;
  state.waveKills = 0;
  state.bestCombo = 0;
  bullets.length = 0;
  enemies.length = 0;
  experienceOrbs.length = 0;
  particles.length = 0;
  floaters.length = 0;
  powerupOrbs.length = 0;
}

describe("enemy kill rewards", () => {
  beforeEach(resetWorld);

  it("awards visible scaled score and marks five-kill streaks", () => {
    const enemyScore = 35;
    const awardedScore = scoreAward(enemyScore, state.wave);

    for (let i = 1; i <= 5; i += 1) {
      enemies.push(makeEnemy(i, enemyScore));
      killEnemy(enemies.length - 1);
    }

    expect(state.score).toBe(awardedScore * 5);
    expect(floaters.map((floater) => floater.text)).toEqual([
      `+${awardedScore}`,
      `+${awardedScore}`,
      `+${awardedScore}`,
      `+${awardedScore}`,
      `+${awardedScore}`,
      "SERIE x5",
    ]);
  });
});

describe("boss visuals", () => {
  beforeEach(resetWorld);

  it("assigns deterministic boss variants from boss wave milestones", () => {
    for (const [wave, variant] of [
      [10, 0],
      [20, 1],
      [60, 5],
      [70, 6],
    ] as const) {
      enemies.length = 0;
      state.wave = wave;

      spawnWaveBoss();

      expect(enemies).toHaveLength(1);
      expect(enemies[0]!.role).toBe("boss");
      expect(enemies[0]!.bossVariant).toBe(variant);
      expect(enemies[0]!.color).toBe(bossVisualForVariant(variant).accent);
    }
  });

  it("cycles boss visual identities after the first six unique bosses", () => {
    expect(bossVisualForVariant(0).name).toBe("Crimson Needle");
    expect(bossVisualForVariant(bossVisuals.length).name).toBe("Crimson Needle");
  });
});

describe("enemy synergy interactions", () => {
  beforeEach(resetWorld);

  it("lets kinetic ram damage contact enemies without hull damage", () => {
    player.traits.kineticRam = true;
    player.shieldMax = 40;
    player.shield = 40;
    player.vx = player.speed;
    enemies.push({ ...makeEnemy(1, 35), x: player.x + 8, y: player.y, hp: 200, maxHp: 200 });

    updateEnemies(0);

    expect(player.hp).toBe(100);
    expect(player.shield).toBeLessThan(40);
    expect(enemies[0]!.hp).toBeLessThan(200);
  });

  it("turns stored magnet storm charge into area damage", () => {
    player.traits.magnetStorm = true;
    player.magnetStormCharge = 30;
    enemies.push({ ...makeEnemy(1, 35), x: player.x + 60, y: player.y, hp: 1000, maxHp: 1000 });
    enemies.push({ ...makeEnemy(2, 35), x: player.x + 900, y: player.y, hp: 1000, maxHp: 1000 });

    updateEnemies(0);

    expect(player.magnetStormCharge).toBe(0);
    expect(player.magnetStormTimer).toBeGreaterThan(0);
    expect(enemies.find((enemy) => enemy.id === 1)!.hp).toBeLessThan(1000);
    expect(enemies.find((enemy) => enemy.id === 2)!.hp).toBe(1000);
  });

  it("keeps magnet storm charged when no enemy is in range", () => {
    player.traits.magnetStorm = true;
    player.magnetStormCharge = 30;
    enemies.push({ ...makeEnemy(1, 35), x: player.x + 900, y: player.y, hp: 1000, maxHp: 1000 });

    updateEnemies(0);

    expect(player.magnetStormCharge).toBe(30);
    expect(player.magnetStormTimer).toBe(0);
    expect(enemies[0]!.hp).toBe(1000);
  });
});
