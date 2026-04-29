import {
  bullets,
  chests,
  counters,
  enemies,
  experienceOrbs,
  floaters,
  particles,
  powerupOrbs,
} from "../state";
import type {
  Bullet,
  ChestEntity,
  EnemyEntity,
  EnemyKind,
  EnemyType,
  ExperienceOrb,
  Floater,
  Particle,
  PowerupKind,
  PowerupOrb,
} from "../types";
import { swapRemove } from "../utils";

const enemyPool: EnemyEntity[] = [];
const bulletPool: Bullet[] = [];
const chestPool: ChestEntity[] = [];
const experiencePool: ExperienceOrb[] = [];
const powerupPool: PowerupOrb[] = [];
const particlePool: Particle[] = [];
const floaterPool: Floater[] = [];

export function clearEntityPools(): void {
  enemyPool.length = 0;
  bulletPool.length = 0;
  chestPool.length = 0;
  experiencePool.length = 0;
  powerupPool.length = 0;
  particlePool.length = 0;
  floaterPool.length = 0;
}

export function resetEntityCounters(): void {
  counters.nextEnemyId = 1;
  counters.nextBulletId = 1;
  counters.nextExperienceId = 1;
  counters.nextPowerupId = 1;
  counters.nextChestId = 1;
  counters.nextParticleId = 1;
  counters.nextFloaterId = 1;
}

export function acquireEnemy(type: EnemyType, kind: EnemyKind): EnemyEntity {
  const enemy =
    enemyPool.pop() ??
    ({
      id: 0,
      kind,
      score: 0,
      radius: 0,
      hp: 0,
      maxHp: 0,
      speed: 0,
      damage: 0,
      color: "#ffffff",
      accent: "#ffffff",
      sides: 3,
      x: 0,
      y: 0,
      age: 0,
      seed: 0,
      wobble: 0,
      wobbleRate: 0,
      hit: 0,
    } satisfies EnemyEntity);
  enemy.id = counters.nextEnemyId;
  counters.nextEnemyId += 1;
  enemy.kind = kind;
  enemy.score = type.score;
  enemy.radius = type.radius;
  enemy.damage = type.damage;
  enemy.color = type.color;
  enemy.accent = type.accent;
  enemy.sides = type.sides;
  enemy.role = "normal";
  enemy.bossVariant = undefined;
  enemy.contactTimer = 0;
  enemy.contactCooldown = undefined;
  enemies.push(enemy);
  return enemy;
}

export function releaseEnemy(index: number): EnemyEntity {
  const enemy = swapRemove(enemies, index);
  enemyPool.push(enemy);
  return enemy;
}

export function acquireBullet(): Bullet {
  const bullet =
    bulletPool.pop() ??
    ({
      id: 0,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      radius: 0,
      damage: 0,
      pierce: 0,
      life: 0,
      color: "#ffffff",
      trail: 0,
      hitIds: new Set<number>(),
      source: "player",
      chainRemaining: 0,
    } satisfies Bullet);
  bullet.id = counters.nextBulletId;
  counters.nextBulletId += 1;
  bullet.hitIds.clear();
  bullet.source = "player";
  bullet.chainRemaining = 0;
  bullets.push(bullet);
  return bullet;
}

export function releaseBullet(index: number): Bullet {
  const bullet = swapRemove(bullets, index);
  bullet.hitIds.clear();
  bulletPool.push(bullet);
  return bullet;
}

export function acquireChest(): ChestEntity {
  const chest =
    chestPool.pop() ??
    ({
      id: 0,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      radius: 0,
      age: 0,
    } satisfies ChestEntity);
  chest.id = counters.nextChestId;
  counters.nextChestId += 1;
  chests.push(chest);
  return chest;
}

export function releaseChest(index: number): ChestEntity {
  const chest = swapRemove(chests, index);
  chestPool.push(chest);
  return chest;
}

export function acquireExperienceOrb(): ExperienceOrb {
  const orb =
    experiencePool.pop() ??
    ({
      id: 0,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      radius: 0,
      value: 0,
      age: 0,
      magnetized: false,
    } satisfies ExperienceOrb);
  orb.id = counters.nextExperienceId;
  counters.nextExperienceId += 1;
  experienceOrbs.push(orb);
  return orb;
}

export function releaseExperienceOrb(index: number): ExperienceOrb {
  const orb = swapRemove(experienceOrbs, index);
  experiencePool.push(orb);
  return orb;
}

export function acquirePowerupOrb(kind: PowerupKind): PowerupOrb {
  const orb =
    powerupPool.pop() ??
    ({
      id: 0,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      radius: 0,
      kind,
      age: 0,
      life: 0,
    } satisfies PowerupOrb);
  orb.id = counters.nextPowerupId;
  counters.nextPowerupId += 1;
  orb.kind = kind;
  powerupOrbs.push(orb);
  return orb;
}

export function releasePowerupOrb(index: number): PowerupOrb {
  const orb = swapRemove(powerupOrbs, index);
  powerupPool.push(orb);
  return orb;
}

export function acquireParticle(): Particle {
  const particle =
    particlePool.pop() ??
    ({
      id: 0,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      size: 0,
      color: "#ffffff",
      life: 0,
      maxLife: 0,
      behind: false,
    } satisfies Particle);
  particle.id = counters.nextParticleId;
  counters.nextParticleId += 1;
  particles.push(particle);
  return particle;
}

export function releaseParticle(index: number): Particle {
  const particle = swapRemove(particles, index);
  particlePool.push(particle);
  return particle;
}

export function acquireFloater(): Floater {
  const floater =
    floaterPool.pop() ??
    ({
      id: 0,
      x: 0,
      y: 0,
      text: "",
      color: "#ffffff",
      damageText: false,
      life: 0,
      maxLife: 0,
    } satisfies Floater);
  floater.id = counters.nextFloaterId;
  counters.nextFloaterId += 1;
  floaters.push(floater);
  return floater;
}

export function releaseFloater(index: number): Floater {
  const floater = swapRemove(floaters, index);
  floaterPool.push(floater);
  return floater;
}
