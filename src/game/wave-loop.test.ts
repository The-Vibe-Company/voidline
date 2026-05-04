import { beforeEach, describe, expect, it } from "vitest";
import {
  counters,
  enemies,
  player,
  resetPlayerToBase,
  spawnIndicators,
  state,
  world,
} from "../state";
import {
  SPAWN_TELEGRAPH_BOSS_DURATION,
  SPAWN_ARENA_MARGIN,
  SPAWN_MIN_DISTANCE_FROM_PLAYER,
  SPAWN_TELEGRAPH_DURATION,
  boss as bossBalance,
  enemyHpScale,
  findEnemyType,
} from "./balance";
import {
  clearRunEntities,
  randomSpawnPoint,
  spawnBoss,
  spawnEnemy,
  stepWave,
  updateSpawnIndicators,
} from "./wave-loop";

beforeEach(() => {
  clearRunEntities();
  resetPlayerToBase();
  counters.nextEnemyId = 1;
  counters.nextSpawnIndicatorId = 1;
  state.mode = "playing";
  state.wave = 1;
  state.waveTimer = 10;
  state.waveTotalDuration = 10;
  state.spawnTimer = 1;
  state.spawnsRemaining = 0;
  player.x = world.arenaWidth / 2;
  player.y = world.arenaHeight / 2;
});

describe("wave loop spawn telegraphs", () => {
  it("spawnEnemy queues an indicator without creating an enemy", () => {
    spawnEnemy("scout");

    expect(spawnIndicators).toHaveLength(1);
    expect(enemies).toHaveLength(0);
    expect(state.enemiesAlive).toBe(0);
    expect(spawnIndicators[0]?.kind).toBe("scout");
  });

  it("materializes an enemy at the indicator position after the telegraph expires", () => {
    spawnEnemy("hunter");
    const indicator = spawnIndicators[0]!;
    const { x, y } = indicator;

    updateSpawnIndicators(SPAWN_TELEGRAPH_DURATION + 0.01);

    expect(spawnIndicators).toHaveLength(0);
    expect(enemies).toHaveLength(1);
    expect(enemies[0]?.kind).toBe("hunter");
    expect(enemies[0]?.x).toBe(x);
    expect(enemies[0]?.y).toBe(y);
    expect(state.enemiesAlive).toBe(1);
  });

  it("advances pending indicators through stepWave over multiple frames", () => {
    spawnEnemy("scout");

    for (let i = 0; i < 15; i += 1) {
      stepWave(0.05);
    }

    expect(spawnIndicators).toHaveLength(0);
    expect(enemies).toHaveLength(1);
    expect(enemies[0]?.kind).toBe("scout");
  });

  it("materializes boss indicators with boss stats", () => {
    const brute = findEnemyType("brute");
    spawnBoss();

    expect(spawnIndicators).toHaveLength(1);
    expect(spawnIndicators[0]?.isBoss).toBe(true);
    expect(spawnIndicators[0]?.life).toBe(SPAWN_TELEGRAPH_BOSS_DURATION);

    updateSpawnIndicators(SPAWN_TELEGRAPH_BOSS_DURATION + 0.01);

    expect(spawnIndicators).toHaveLength(0);
    expect(enemies).toHaveLength(1);
    expect(enemies[0]?.isBoss).toBe(true);
    expect(enemies[0]?.radius).toBe(brute.radius * bossBalance.radiusMultiplier);
    expect(enemies[0]?.hp).toBe(brute.hp * enemyHpScale(state.wave) * bossBalance.hpMultiplier);
  });

  it("chooses in-arena spawn points away from the player", () => {
    const minDistSq = SPAWN_MIN_DISTANCE_FROM_PLAYER * SPAWN_MIN_DISTANCE_FROM_PLAYER;

    for (let i = 0; i < 200; i += 1) {
      const point = randomSpawnPoint();
      const dx = point.x - player.x;
      const dy = point.y - player.y;

      expect(point.x).toBeGreaterThanOrEqual(SPAWN_ARENA_MARGIN);
      expect(point.x).toBeLessThanOrEqual(world.arenaWidth - SPAWN_ARENA_MARGIN);
      expect(point.y).toBeGreaterThanOrEqual(SPAWN_ARENA_MARGIN);
      expect(point.y).toBeLessThanOrEqual(world.arenaHeight - SPAWN_ARENA_MARGIN);
      expect(dx * dx + dy * dy).toBeGreaterThanOrEqual(minDistSq);
    }
  });

  it("does not transition to shop while a spawn indicator is pending", () => {
    spawnEnemy("scout");
    state.waveTimer = 0;

    stepWave(0.01);

    expect(state.mode).toBe("playing");
    expect(spawnIndicators).toHaveLength(1);
  });

  it("keeps materialized telegraph enemies alive after the wave timer expires", () => {
    spawnEnemy("scout");
    spawnIndicators[0]!.life = 0.01;
    state.waveTimer = 0;

    stepWave(0.05);

    expect(state.mode).toBe("playing");
    expect(spawnIndicators).toHaveLength(0);
    expect(enemies).toHaveLength(1);
    expect(state.enemiesAlive).toBe(1);
  });
});
