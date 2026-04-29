import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  bullets,
  counters,
  enemies,
  experienceOrbs,
  floaters,
  particles,
  player,
  powerupOrbs,
  state,
  world,
} from "../state";
import { updateBullets } from "./bullets";
import type { Bullet, EnemyEntity } from "../types";

function placeEnemy(id: number, x: number, y: number, hp = 1000): EnemyEntity {
  return {
    id,
    kind: "scout",
    score: 35,
    radius: 14,
    hp,
    maxHp: hp,
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

function placeBullet(x: number, y: number, opts: Partial<Bullet> = {}): Bullet {
  return {
    id: 1,
    x,
    y,
    vx: 0,
    vy: 0,
    radius: 4,
    damage: 10,
    pierce: 0,
    life: 1,
    color: "#39d9ff",
    trail: 0,
    hitIds: new Set<number>(),
    ...opts,
  };
}

function resetWorld(): void {
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
  player.hp = 100;
  player.maxHp = 100;
  player.lifesteal = 0;
  state.mode = "playing";
  state.wave = 1;
  state.score = 0;
  state.waveKills = 0;
  state.bestCombo = 0;
  state.heartsCarried = 0;
  state.magnetsCarried = 0;
  state.bombsCarried = 0;
  counters.nextEnemyId = 1;
  counters.nextBulletId = 1;
  counters.nextExperienceId = 1;
  counters.nextPowerupId = 1;
  counters.nextParticleId = 1;
  counters.nextFloaterId = 1;
  bullets.length = 0;
  enemies.length = 0;
  experienceOrbs.length = 0;
  particles.length = 0;
  floaters.length = 0;
  powerupOrbs.length = 0;
}

describe("bullet vs enemy spatial collision", () => {
  beforeEach(resetWorld);
  afterEach(resetWorld);

  it("registers a hit when the bullet overlaps the enemy", () => {
    enemies.push(placeEnemy(1, 500, 500));
    bullets.push(placeBullet(500, 500));

    updateBullets(0);

    expect(enemies[0]!.hp).toBeLessThan(enemies[0]!.maxHp);
  });

  it("ignores enemies in distant cells", () => {
    enemies.push(placeEnemy(1, 500, 500));
    enemies.push(placeEnemy(2, 1500, 1500));
    bullets.push(placeBullet(500, 500));

    updateBullets(0);

    expect(enemies.find((e) => e.id === 1)!.hp).toBeLessThan(1000);
    expect(enemies.find((e) => e.id === 2)!.hp).toBe(1000);
  });

  it("hits the correct enemy when several share a cell", () => {
    enemies.push(placeEnemy(1, 500, 500));
    enemies.push(placeEnemy(2, 480, 500));
    bullets.push(placeBullet(481, 500));

    updateBullets(0);

    const e1 = enemies.find((e) => e.id === 1)!;
    const e2 = enemies.find((e) => e.id === 2)!;
    expect(e1.hp + e2.hp).toBeLessThan(2000);
    expect(e1.hp === 1000 || e2.hp === 1000).toBe(true);
  });

  it("a bullet only hits one enemy per frame even with pierce", () => {
    enemies.push(placeEnemy(1, 500, 500));
    enemies.push(placeEnemy(2, 510, 500));
    bullets.push(placeBullet(500, 500, { pierce: 5 }));

    updateBullets(0);

    const damaged = enemies.filter((e) => e.hp < e.maxHp);
    expect(damaged.length).toBe(1);
  });

  it("removes the bullet once pierce is exhausted", () => {
    enemies.push(placeEnemy(1, 500, 500));
    bullets.push(placeBullet(500, 500, { pierce: 0 }));

    updateBullets(0);

    expect(bullets.length).toBe(0);
  });

  it("keeps the bullet alive when it pierces", () => {
    enemies.push(placeEnemy(1, 500, 500));
    bullets.push(placeBullet(500, 500, { pierce: 1 }));

    updateBullets(0);

    expect(bullets.length).toBe(1);
    expect(bullets[0]!.pierce).toBe(0);
  });

  it("does not hit the same enemy twice with one bullet", () => {
    enemies.push(placeEnemy(1, 500, 500, 1000));
    bullets.push(placeBullet(500, 500, { pierce: 5 }));

    updateBullets(0);
    const after1 = enemies[0]!.hp;
    updateBullets(0);
    const after2 = enemies[0]!.hp;

    expect(after2).toBe(after1);
  });

  it("removes bullets that fly off the arena", () => {
    bullets.push(placeBullet(world.arenaWidth + 200, 100));

    updateBullets(0);

    expect(bullets.length).toBe(0);
  });
});
