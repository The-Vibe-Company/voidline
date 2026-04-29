import { bench, describe } from "vitest";
import { bullets, counters, enemies, experienceOrbs, player, world } from "../state";
import { updateBullets } from "../entities/bullets";
import { updateExperience } from "../entities/experience";
import { updatePlayer } from "../entities/player";
import { createPlayerBonus } from "../game/balance";
import { enemyGrid } from "../simulation/grids";
import { mulberry32 } from "./rng";

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
  player.radius = 18;
  player.vx = 0;
  player.vy = 0;
  player.hp = 100;
  player.maxHp = 100;
  player.lifesteal = 0;
  player.invuln = 0;
  player.pickupRadius = 1;
  player.bonus = createPlayerBonus();
  player.drones = 0;
  player.fireTimer = 0;
  player.droneTimer = 0;
  counters.nextEnemyId = 1;
}

function seedEnemies(count: number, rand: () => number): void {
  enemies.length = 0;
  for (let i = 0; i < count; i += 1) {
    enemies.push({
      id: i + 1,
      kind: "scout",
      score: 35,
      radius: 14,
      hp: 30,
      maxHp: 30,
      speed: 0,
      damage: 12,
      color: "#ff5a69",
      accent: "#ffd0d5",
      sides: 3,
      x: rand() * world.arenaWidth,
      y: rand() * world.arenaHeight,
      age: 0,
      seed: 0,
      wobble: 0,
      wobbleRate: 1,
      hit: 0,
    });
  }
}

function seedBullets(count: number, rand: () => number): void {
  bullets.length = 0;
  for (let i = 0; i < count; i += 1) {
    bullets.push({
      id: i + 1,
      x: rand() * world.arenaWidth,
      y: rand() * world.arenaHeight,
      vx: 0,
      vy: 0,
      radius: 4,
      damage: 1,
      pierce: 0,
      life: 1,
      color: "#39d9ff",
      trail: 0,
      hitIds: new Set<number>(),
      source: "player",
      chainRemaining: 0,
    });
  }
}

function seedOrbs(count: number, rand: () => number, magnetized: boolean): void {
  experienceOrbs.length = 0;
  for (let i = 0; i < count; i += 1) {
    experienceOrbs.push({
      id: i + 1,
      x: rand() * world.arenaWidth,
      y: rand() * world.arenaHeight,
      vx: 0,
      vy: 0,
      radius: 6,
      value: 1,
      age: 0,
      magnetized,
    });
  }
}

describe("bullet vs enemy collision", () => {
  bench("40 bullets x 80 enemies", () => {
    resetWorld();
    const rand = mulberry32(1);
    seedEnemies(80, rand);
    seedBullets(40, rand);
    updateBullets(0.016);
  });

  bench("80 bullets x 200 enemies", () => {
    resetWorld();
    const rand = mulberry32(2);
    seedEnemies(200, rand);
    seedBullets(80, rand);
    updateBullets(0.016);
  });

  bench("200 bullets x 400 enemies (stress)", () => {
    resetWorld();
    const rand = mulberry32(3);
    seedEnemies(400, rand);
    seedBullets(200, rand);
    updateBullets(0.016);
  });

  bench("300 bullets x 2000 enemies (2000-active target)", () => {
    resetWorld();
    const rand = mulberry32(7);
    seedEnemies(2000, rand);
    seedBullets(300, rand);
    updateBullets(0.016);
  });
});

describe("auto-aim and drone targeting", () => {
  bench("2000 enemies x player auto-aim + drones", () => {
    resetWorld();
    const rand = mulberry32(8);
    seedEnemies(2000, rand);
    player.drones = 5;
    player.projectileCount = 8;
    player.fireTimer = 0;
    player.droneTimer = 0;
    enemyGrid.rebuild(enemies);
    updatePlayer(0.016);
  });
});

describe("experience orb update", () => {
  bench("200 orbs, no magnet", () => {
    resetWorld();
    const rand = mulberry32(4);
    seedOrbs(200, rand, false);
    updateExperience(0.016);
  });

  bench("200 orbs, all magnetized", () => {
    resetWorld();
    const rand = mulberry32(5);
    seedOrbs(200, rand, true);
    updateExperience(0.016);
  });

  bench("500 orbs, all magnetized (stress)", () => {
    resetWorld();
    const rand = mulberry32(6);
    seedOrbs(500, rand, true);
    updateExperience(0.016);
  });

  bench("1000 orbs, all magnetized (2000-active target)", () => {
    resetWorld();
    const rand = mulberry32(9);
    seedOrbs(1000, rand, true);
    updateExperience(0.016);
  });
});
