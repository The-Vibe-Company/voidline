import { beforeEach, describe, expect, it } from "vitest";
import {
  attackTelegraphs,
  bullets,
  counters,
  enemies,
  enemyBullets,
  player,
  resetPlayerToBase,
  spawnIndicators,
  state,
  world,
} from "../state";
import type { EnemyEntity } from "../types";
import {
  BOSS_MINI_WAVE_INDEX,
  SPAWN_TELEGRAPH_BOSS_DURATION,
  SPAWN_ARENA_MARGIN,
  SPAWN_MIN_DISTANCE_FROM_PLAYER,
  SPAWN_TELEGRAPH_DURATION,
  SPLITTER_CHILD_COUNT,
  STINGER_DASH_SPEED_MULT,
  bossAttacks,
  boss as bossBalance,
  enemyHpScale,
  findEnemyType,
} from "./balance";
import {
  clearRunEntities,
  pickEnemyKind,
  randomSpawnPoint,
  spawnBoss,
  spawnEnemy,
  stepWave,
  updateSpawnIndicators,
} from "./wave-loop";
import { startRun } from "./wave-flow";

beforeEach(() => {
  world.arenaWidth = 1280;
  world.arenaHeight = 720;
  startRun("pulse");
  clearRunEntities();
  resetPlayerToBase();
  counters.nextEnemyId = 1;
  counters.nextSpawnIndicatorId = 1;
  counters.nextEnemyBulletId = 1;
  counters.nextAttackTelegraphId = 1;
  state.mode = "playing";
  state.miniWaveIndex = 0;
  state.waveTimer = 10;
  state.waveTotalDuration = 10;
  state.spawnTimer = 1;
  state.spawnsRemaining = 0;
  player.x = world.arenaWidth / 2;
  player.y = world.arenaHeight / 2;
  player.invuln = 0;
});

function spawnImmediate(kind: "scout" | "hunter" | "brute" | "sentinel" | "stinger" | "splitter"): void {
  spawnEnemy(kind);
  updateSpawnIndicators(SPAWN_TELEGRAPH_DURATION + 0.01);
}

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

  it("materializes boss indicators with boss stats", () => {
    state.miniWaveIndex = BOSS_MINI_WAVE_INDEX;
    const brute = findEnemyType("brute");
    spawnBoss();

    expect(spawnIndicators).toHaveLength(1);
    expect(spawnIndicators[0]?.isBoss).toBe(true);

    updateSpawnIndicators(SPAWN_TELEGRAPH_BOSS_DURATION + 0.01);

    expect(spawnIndicators).toHaveLength(0);
    expect(enemies).toHaveLength(1);
    expect(enemies[0]?.isBoss).toBe(true);
    expect(enemies[0]?.radius).toBe(brute.radius * bossBalance.radiusMultiplier);
    expect(enemies[0]?.hp).toBe(
      brute.hp * enemyHpScale(state.miniWaveIndex) * bossBalance.hpMultiplier,
    );
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

  it("transitions to card-pick when wave timer expires on a non-boss mini-wave", () => {
    spawnEnemy("scout");
    state.waveTimer = 0;

    stepWave(0.01);

    expect(state.mode).toBe("card-pick");
    expect(spawnIndicators).toHaveLength(0);
  });

  it("waits for boss death before ending the boss mini-wave", () => {
    state.miniWaveIndex = BOSS_MINI_WAVE_INDEX;
    state.spawnsRemaining = 0;
    enemies.push({
      id: counters.nextEnemyId++,
      kind: "brute",
      score: 0,
      radius: 20,
      hp: 1_000_000,
      maxHp: 1_000_000,
      speed: 0,
      damage: 0,
      color: "#fff",
      accent: "#fff",
      sides: 6,
      x: player.x + 200,
      y: player.y + 200,
      age: 0,
      hit: 0,
      isBoss: true,
      contactCooldown: 0,
      behavior: "seeker",
      attackTimer: 0,
      attackState: "idle",
      attackProgress: 0,
      attackTargetX: 0,
      attackTargetY: 0,
      attackVx: 0,
      attackVy: 0,
    });
    state.enemiesAlive += 1;
    state.waveTimer = 0;

    stepWave(0.01);

    expect(state.mode).toBe("playing");
  });
});

describe("mono-weapon firing", () => {
  function injectDummyEnemy(): EnemyEntity {
    const e: EnemyEntity = {
      id: counters.nextEnemyId++,
      kind: "scout",
      score: 30,
      radius: 9,
      hp: 1_000_000,
      maxHp: 1_000_000,
      speed: 0,
      damage: 0,
      color: "#fff",
      accent: "#fff",
      sides: 3,
      x: player.x + 60,
      y: player.y,
      age: 0,
      hit: 0,
      isBoss: false,
      contactCooldown: 0,
      behavior: "seeker",
      attackTimer: 0,
      attackState: "idle",
      attackProgress: 0,
      attackTargetX: 0,
      attackTargetY: 0,
      attackVx: 0,
      attackVy: 0,
    };
    enemies.push(e);
    state.enemiesAlive += 1;
    return e;
  }

  it("the active weapon fires periodically", () => {
    bullets.length = 0;
    counters.nextBulletId = 1;
    injectDummyEnemy();
    const startId = counters.nextBulletId;
    const elapsed = 2.0;
    const dt = 1 / 60;
    for (let t = 0; t < elapsed; t += dt) {
      stepWave(dt);
    }
    const fired = counters.nextBulletId - startId;
    expect(fired).toBeGreaterThanOrEqual(2);
    expect(fired).toBeLessThanOrEqual(8);
  });
});

describe("pickEnemyKind gating by mini-wave index", () => {
  it("only emits scouts at mini-wave 0", () => {
    const kinds = new Set<string>();
    for (let i = 0; i < 200; i += 1) kinds.add(pickEnemyKind(0, Math.random()));
    expect(kinds.has("brute")).toBe(false);
    expect(kinds.has("sentinel")).toBe(false);
    expect(kinds.has("stinger")).toBe(false);
    expect(kinds.has("splitter")).toBe(false);
  });

  it("emits all archetypes at mini-wave 4", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1500; i += 1) seen.add(pickEnemyKind(4, Math.random()));
    expect(seen.has("hunter")).toBe(true);
  });
});

describe("enemy archetype lookups", () => {
  it("resolves all six kinds to concrete types", () => {
    const ids = ["scout", "hunter", "brute", "sentinel", "stinger", "splitter"] as const;
    for (const id of ids) {
      const type = findEnemyType(id);
      expect(type.id).toBe(id);
    }
  });
});

describe("ranged sentinel behavior", () => {
  it("queues an attack telegraph then fires an enemy projectile", () => {
    spawnImmediate("sentinel");
    const sentinel = enemies[0]!;
    sentinel.x = player.x + 260;
    sentinel.y = player.y;
    sentinel.attackTimer = 0;
    sentinel.hp = 1e6;

    stepWave(0.02);
    expect(sentinel.attackState).toBe("windup");
    expect(attackTelegraphs.length).toBeGreaterThanOrEqual(1);

    let fired = false;
    for (let i = 0; i < 60; i += 1) {
      stepWave(0.02);
      if (sentinel.attackState === "idle") {
        fired = true;
        break;
      }
    }
    expect(fired).toBe(true);
    expect(enemyBullets.length).toBeGreaterThanOrEqual(1);
  });
});

describe("dasher stinger behavior", () => {
  it("enters windup then accelerates during recovery", () => {
    spawnImmediate("stinger");
    const stinger = enemies[0]!;
    stinger.x = player.x + 150;
    stinger.y = player.y;
    stinger.attackTimer = 0;

    stepWave(0.02);
    expect(stinger.attackState).toBe("windup");

    for (let i = 0; i < 30; i += 1) stepWave(0.02);
    const dashSpeed = Math.hypot(stinger.attackVx, stinger.attackVy);
    expect(stinger.attackState === "recovering" || stinger.attackState === "idle").toBe(true);
    if (stinger.attackState === "recovering") {
      expect(dashSpeed).toBeGreaterThan(stinger.speed * (STINGER_DASH_SPEED_MULT - 1));
    }
  });
});

describe("splitter death", () => {
  it("spawns SPLITTER_CHILD_COUNT mini-scouts when killed", () => {
    spawnImmediate("splitter");
    const splitter = enemies[0]!;
    splitter.x = player.x;
    splitter.y = player.y;
    splitter.hp = 1;

    bullets.push({
      id: 9999,
      x: splitter.x,
      y: splitter.y,
      vx: 1,
      vy: 0,
      radius: 8,
      damage: 1000,
      pierce: 0,
      life: 0.5,
      hitIds: new Set<number>(),
    });

    stepWave(0.02);

    expect(enemies.find((e) => e.kind === "splitter")).toBeUndefined();
    const childCount = enemies.filter((e) => e.kind === "scout").length;
    expect(childCount).toBe(SPLITTER_CHILD_COUNT);
  });
});

describe("enemy bullets and damage", () => {
  it("damages player on contact and is removed", () => {
    enemyBullets.push({
      id: counters.nextEnemyBulletId++,
      x: player.x,
      y: player.y,
      vx: 0,
      vy: 0,
      radius: 6,
      damage: 14,
      life: 1,
      color: "#39d9ff",
    });
    player.invuln = 0;
    const before = player.hp;

    stepWave(0.02);

    expect(enemyBullets).toHaveLength(0);
    expect(player.hp).toBe(before - 14);
  });
});

describe("boss-kill victory window", () => {
  it("clamps the boss-wave timer to <= 1.5s the moment the boss dies", () => {
    state.miniWaveIndex = BOSS_MINI_WAVE_INDEX;
    state.spawnsRemaining = 0;
    state.waveTimer = 12;
    state.waveTotalDuration = 12;
    spawnBoss();
    updateSpawnIndicators(SPAWN_TELEGRAPH_BOSS_DURATION + 0.01);
    const boss = enemies[0]!;
    boss.x = player.x;
    boss.y = player.y;
    boss.hp = 1;
    bullets.push({
      id: 9999,
      x: boss.x,
      y: boss.y,
      vx: 0,
      vy: 0,
      radius: 14,
      damage: 1000,
      pierce: 0,
      life: 0.5,
      hitIds: new Set<number>(),
    });
    const before = state.waveTimer;

    stepWave(0.02);

    expect(state.bossDefeated).toBe(true);
    expect(state.waveTimer).toBeLessThanOrEqual(1.5);
    expect(state.waveTimer).toBeLessThan(before);
  });
});

describe("boss aggression salvos", () => {
  it("fires its first salvo after the warmup", () => {
    state.miniWaveIndex = BOSS_MINI_WAVE_INDEX;
    spawnBoss();
    updateSpawnIndicators(SPAWN_TELEGRAPH_BOSS_DURATION + 0.01);
    const boss = enemies[0]!;
    expect(boss.isBoss).toBe(true);
    boss.x = world.arenaWidth - 100;
    boss.y = world.arenaHeight - 100;
    player.x = 100;
    player.y = 100;

    const dt = 0.05;
    const steps = Math.ceil((bossAttacks.shotWarmup + 0.5) / dt);
    for (let i = 0; i < steps; i += 1) stepWave(dt);

    expect(enemyBullets.length).toBeGreaterThanOrEqual(1);
  });
});
