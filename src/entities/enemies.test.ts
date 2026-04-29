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
import { balance, scaledEnemyStats, scoreAward } from "../game/balance";
import { bossBalance } from "../game/roguelike";
import { clearEntityPools, resetEntityCounters } from "../simulation/pools";
import { setSimulationSeed } from "../simulation/random";
import type { EnemyEntity, EnemyKind, EnemyType } from "../types";
import { killEnemy, spawnEnemy, spawnMiniBoss, spawnWaveBoss } from "./enemies";

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

function enemyType(kind: EnemyKind): EnemyType {
  const type = balance.enemies.find((item) => item.id === kind);
  if (!type) throw new Error(`Missing enemy type ${kind}`);
  return type;
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

  it("applies late-wave damage scaling to spawned enemies", () => {
    state.wave = 10;

    spawnEnemy();

    const enemy = enemies[0]!;
    const expected = scaledEnemyStats(enemyType(enemy.kind), state.wave);
    expect(enemy.damage).toBeCloseTo(expected.damage);
    expect(enemy.hp).toBeCloseTo(expected.hp);
    expect(enemy.speed).toBeCloseTo(expected.speed);
  });

  it("applies late-wave damage scaling before elite multipliers", () => {
    state.wave = 12;
    spawnMiniBoss();

    const miniBoss = enemies[0]!;
    const miniBossBase = scaledEnemyStats(enemyType(miniBoss.kind), state.wave);
    expect(miniBoss.role).toBe("mini-boss");
    expect(miniBoss.damage).toBeCloseTo(
      miniBossBase.damage * bossBalance.miniBoss.damageMultiplier,
    );

    enemies.length = 0;
    state.wave = 20;
    spawnWaveBoss();

    const boss = enemies[0]!;
    const bossBase = scaledEnemyStats(enemyType(boss.kind), state.wave);
    expect(boss.role).toBe("boss");
    expect(boss.damage).toBeCloseTo(bossBase.damage * bossBalance.boss.damageMultiplier);
  });
});
