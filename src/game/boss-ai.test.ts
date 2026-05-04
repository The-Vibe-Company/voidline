import { beforeEach, describe, expect, it } from "vitest";
import {
  counters,
  enemies,
  enemyBullets,
  player,
  resetPlayerToBase,
  spawnIndicators,
  state,
  world,
} from "../state";
import {
  BOSS_MINI_WAVE_INDEX,
  bossAttacks,
  bossAggression,
  bossShotInterval,
  bossShotProjectiles,
  bossSpawnCount,
  bossSpawnInterval,
} from "./balance";
import { clearRunEntities, spawnBoss, stepWave, updateSpawnIndicators } from "./wave-loop";
import { startRun } from "./wave-flow";

function materializeBossNow(): void {
  spawnBoss();
  updateSpawnIndicators(99);
}

beforeEach(() => {
  world.arenaWidth = 1280;
  world.arenaHeight = 720;
  startRun("pulse");
  clearRunEntities();
  resetPlayerToBase();
  counters.nextEnemyId = 1;
  counters.nextSpawnIndicatorId = 1;
  counters.nextEnemyBulletId = 1;
  state.mode = "playing";
  state.miniWaveIndex = BOSS_MINI_WAVE_INDEX;
  state.waveTimer = 60;
  state.waveTotalDuration = 60;
  state.spawnTimer = 99;
  state.spawnsRemaining = 0;
  player.x = world.arenaWidth / 2;
  player.y = world.arenaHeight / 2;
  player.invuln = 0;
});

describe("boss aggression curves", () => {
  it("starts at 1 and ramps up to the cap", () => {
    expect(bossAggression(0)).toBe(1);
    expect(bossAggression(1000)).toBe(bossAttacks.aggressionCap);
    expect(bossAggression(10)).toBeGreaterThan(1);
  });

  it("shot interval shrinks from base toward min", () => {
    expect(bossShotInterval(0)).toBeCloseTo(bossAttacks.shotIntervalBase);
    expect(bossShotInterval(1000)).toBeCloseTo(bossAttacks.shotIntervalMin);
    expect(bossShotInterval(20)).toBeLessThan(bossShotInterval(0));
    expect(bossShotInterval(1000)).toBeGreaterThanOrEqual(bossAttacks.shotIntervalMin - 1e-6);
  });

  it("shot projectile count grows from base toward max", () => {
    expect(bossShotProjectiles(0)).toBe(bossAttacks.shotProjectileBase);
    expect(bossShotProjectiles(1000)).toBe(bossAttacks.shotProjectileMax);
  });

  it("spawn interval shrinks and spawn count grows", () => {
    expect(bossSpawnInterval(0)).toBeCloseTo(bossAttacks.spawnIntervalBase);
    expect(bossSpawnInterval(1000)).toBeCloseTo(bossAttacks.spawnIntervalMin);
    expect(bossSpawnCount(0)).toBe(bossAttacks.spawnCountBase);
    expect(bossSpawnCount(1000)).toBe(bossAttacks.spawnCountMax);
  });
});

describe("boss in-game AI", () => {
  it("fires its first salvo after the warmup", () => {
    materializeBossNow();
    player.x = 100;
    player.y = 100;
    const boss = enemies[0]!;
    boss.x = world.arenaWidth - 100;
    boss.y = world.arenaHeight - 100;
    boss.speed = 0;

    expect(enemyBullets.length).toBe(0);

    for (let i = 0; i < 60; i += 1) stepWave(0.05);

    expect(enemyBullets.length).toBeGreaterThanOrEqual(1);
    const projectile = enemyBullets[0]!;
    expect(projectile.damage).toBe(bossAttacks.shotDamage);
    expect(Math.hypot(projectile.vx, projectile.vy)).toBeCloseTo(bossAttacks.shotSpeed, 1);
  });

  it("queues minion spawn telegraphs after the spawn warmup", () => {
    materializeBossNow();
    player.x = 100;
    player.y = 100;
    const boss = enemies[0]!;
    boss.x = world.arenaWidth - 100;
    boss.y = world.arenaHeight - 100;
    boss.speed = 0;

    for (let i = 0; i < 200; i += 1) stepWave(0.05);

    const minionTelegraphs = spawnIndicators.filter((s) => !s.isBoss);
    const newEnemyMinions = enemies.filter((e) => !e.isBoss);
    expect(minionTelegraphs.length + newEnemyMinions.length).toBeGreaterThanOrEqual(1);
  });

  it("damages the player when an enemy bullet hits", () => {
    materializeBossNow();
    const boss = enemies[0]!;
    boss.speed = 0;
    boss.x = -9999;
    boss.y = -9999;
    const startHp = player.hp;
    enemyBullets.push({
      id: counters.nextEnemyBulletId++,
      x: player.x,
      y: player.y,
      vx: 0,
      vy: 0,
      radius: 6,
      damage: 7,
      life: 1,
      color: "#ff5af0",
    });

    stepWave(0.016);

    expect(player.hp).toBe(startHp - 7);
    expect(enemyBullets).toHaveLength(0);
  });
});
