import * as Phaser from "phaser";
import {
  bullets,
  chests,
  enemies,
  experienceOrbs,
  floaters,
  particles,
  perfStats,
  player,
  pointer,
  powerupOrbs,
  simulationPerfConfig,
  state,
  world,
} from "../../state";
import { stepSimulation } from "../../simulation/simulation";
import { flushSimulationHud } from "../../render/hud";
import { resetPerfFrame } from "../../state";
import { clamp, colorToNumber, screenToWorld } from "../../utils";
import { ImageRenderPool, TextRenderPool } from "../pools";
import { textureKeys } from "../textures";
import { recordStressFrame } from "../../perf/stress-mode";
import { bossVisualForVariant, bossVisuals } from "../../game/boss-visuals";
import { pickupRadiusFor } from "../../entities/experience-pickup";
import type { EnemyEntity, EnemyRole } from "../../types";

const bossCycleTints = [0xffffff, 0xffd0d5, 0xd9f6ff, 0xeaffd8, 0xfff0b8, 0xead4ff] as const;

function enemyTexture(enemy: EnemyEntity): string {
  if (enemy.role === "boss") {
    return bossVisualForVariant(enemy.bossVariant ?? 0).texture;
  }
  if (enemy.role === "mini-boss") {
    return textureKeys.miniBosses[enemy.kind];
  }
  return textureKeys.enemies[enemy.kind];
}

function enemyTextureSize(role: EnemyRole | undefined): number {
  if (role === "boss") return 112;
  if (role === "mini-boss") return 80;
  return 60;
}

function bossCycleTint(variant: number): number {
  const cycle = Math.floor(variant / bossVisuals.length);
  return bossCycleTints[cycle % bossCycleTints.length]!;
}

function bossCycleRotationOffset(variant: number): number {
  if (variant < bossVisuals.length) return 0;
  const cycle = Math.floor(variant / bossVisuals.length);
  return cycle * (Math.PI / 10) + (variant % bossVisuals.length) * 0.05;
}

export class BattleScene extends Phaser.Scene {
  private readonly enemyPools = {
    scout: new ImageRenderPool(this, textureKeys.enemies.scout, 20),
    hunter: new ImageRenderPool(this, textureKeys.enemies.hunter, 20),
    brute: new ImageRenderPool(this, textureKeys.enemies.brute, 20),
  };
  private readonly bulletPool = new ImageRenderPool(this, textureKeys.bullet, 30);
  private readonly xpPool = new ImageRenderPool(this, textureKeys.xp, 15);
  private readonly powerupPool = new ImageRenderPool(this, textureKeys.powerHeart, 18);
  private readonly chestPool = new ImageRenderPool(this, textureKeys.chest, 24);
  private readonly particlePool = new ImageRenderPool(this, textureKeys.particle, 10);
  private readonly dronePool = new ImageRenderPool(this, textureKeys.drone, 34);
  private readonly floaterPool = new TextRenderPool(this);
  private playerShip!: Phaser.GameObjects.Image;
  private background!: Phaser.GameObjects.Graphics;
  private worldGuides!: Phaser.GameObjects.Graphics;
  private renderFrame = 0;
  private hudTimer = 0;

  constructor() {
    super("BattleScene");
  }

  create(): void {
    this.background = this.add.graphics();
    this.background.setScrollFactor(0);
    this.background.setDepth(-100);
    this.worldGuides = this.add.graphics();
    this.worldGuides.setDepth(5);
    this.playerShip = this.add.image(player.x, player.y, textureKeys.player);
    this.playerShip.setDepth(40);
    this.cameras.main.setBounds(0, 0, world.arenaWidth, world.arenaHeight);
  }

  override update(time: number, delta: number): void {
    const rawDt = delta / 1000;
    resetPerfFrame();

    const updateStart = performance.now();
    stepSimulation(rawDt);
    const updateEnd = performance.now();

    this.renderFrame += 1;
    this.syncCamera();
    this.drawBackground();
    this.drawWorldGuides();
    this.syncEntities();
    const renderEnd = performance.now();

    perfStats.updateMs = updateEnd - updateStart;
    perfStats.renderMs = renderEnd - updateEnd;
    perfStats.frameMs = renderEnd - updateStart;

    this.hudTimer += delta;
    flushSimulationHud(this.hudTimer >= 120);
    if (this.hudTimer >= 120) {
      this.hudTimer = 0;
    }
    recordStressFrame(time);
  }

  private syncCamera(): void {
    this.cameras.main.setBounds(0, 0, world.arenaWidth, world.arenaHeight);
    this.cameras.main.setScroll(world.cameraX, world.cameraY);
  }

  private drawBackground(): void {
    const grid = 64;
    const offsetX = -((world.cameraX - world.time * 8) % grid) - grid;
    const offsetY = -((world.cameraY - world.time * 5) % grid) - grid;

    this.background.clear();
    this.background.fillStyle(0x05060b, 1);
    this.background.fillRect(0, 0, world.width, world.height);
    this.background.fillStyle(0x081017, 0.84);
    this.background.fillRect(0, 0, world.width, world.height);
    this.background.lineStyle(1, 0x39d9ff, 0.12);
    this.background.beginPath();
    for (let x = offsetX; x < world.width + grid; x += grid) {
      this.background.moveTo(x, 0);
      this.background.lineTo(x, world.height);
    }
    for (let y = offsetY; y < world.height + grid; y += grid) {
      this.background.moveTo(0, y);
      this.background.lineTo(world.width, y);
    }
    this.background.strokePath();
  }

  private drawWorldGuides(): void {
    this.worldGuides.clear();
    this.worldGuides.lineStyle(2, 0xffbf47, 0.28);
    this.worldGuides.strokeRect(0, 0, world.arenaWidth, world.arenaHeight);

    const sector = 512;
    const left = world.cameraX;
    const top = world.cameraY;
    const right = left + world.width;
    const bottom = top + world.height;
    this.worldGuides.lineStyle(1, 0x72ffb1, 0.08);
    this.worldGuides.beginPath();
    for (let x = Math.ceil(left / sector) * sector; x < right; x += sector) {
      this.worldGuides.moveTo(x, top);
      this.worldGuides.lineTo(x, bottom);
    }
    for (let y = Math.ceil(top / sector) * sector; y < bottom; y += sector) {
      this.worldGuides.moveTo(left, y);
      this.worldGuides.lineTo(right, y);
    }
    this.worldGuides.strokePath();

    if (state.showPickupZones) {
      const pickupRadius = pickupRadiusFor(player);
      this.worldGuides.lineStyle(2, 0x72ffb1, 0.32);
      this.worldGuides.strokeCircle(player.x, player.y, pickupRadius);
    }

    if (player.shield > 1) {
      this.worldGuides.lineStyle(2, 0x72ffb1, 0.18 + player.shield / player.shieldMax * 0.2);
      this.worldGuides.strokeCircle(player.x, player.y, player.radius + 15);
    }

    if (state.mode === "playing" && state.controlMode === "trackpad" && pointer.inside) {
      const target = screenToWorld(pointer.x, pointer.y);
      const distance = Math.hypot(target.x - player.x, target.y - player.y);
      if (distance > 18) {
        this.worldGuides.lineStyle(1, 0x72ffb1, clamp(distance / 240, 0.16, 0.48));
        this.worldGuides.beginPath();
        this.worldGuides.moveTo(player.x, player.y);
        this.worldGuides.lineTo(target.x, target.y);
        this.worldGuides.strokePath();
        this.worldGuides.strokeCircle(target.x, target.y, 12 + Math.sin(world.time * 8) * 2);
      }
    }
  }

  private syncEntities(): void {
    const frame = this.renderFrame;
    this.syncExperience(frame);
    this.syncPowerups(frame);
    this.syncChests(frame);
    this.syncBullets(frame);
    this.syncEnemies(frame);
    this.syncDrones(frame);
    this.syncPlayer();
    this.syncParticles(frame);
    this.syncFloaters(frame);
  }

  private syncEnemies(frame: number): void {
    for (const enemy of enemies) {
      if (!this.inView(enemy.x, enemy.y, enemy.radius + 8)) {
        perfStats.culled += 1;
        continue;
      }
      perfStats.drawn += 1;
      const sprite = this.enemyPools[enemy.kind].sync(enemy.id, frame);
      const role = enemy.role ?? "normal";
      const bossVariant = enemy.bossVariant ?? 0;
      sprite.setPosition(enemy.x, enemy.y);
      sprite.setTexture(enemyTexture(enemy));
      sprite.setRotation(
        enemy.age * (enemy.kind === "brute" || role === "boss" ? 0.7 : 1.6) +
          (role === "boss" ? bossCycleRotationOffset(bossVariant) : 0),
      );
      sprite.setScale((enemy.radius * (role === "normal" ? 2.25 : 2.35)) / enemyTextureSize(role));
      sprite.setAlpha(1);
      sprite.setDepth(role === "boss" ? 28 : role === "mini-boss" ? 24 : 20);
      sprite.clearTint();
      if (enemy.hit > 0) {
        sprite.setTint(colorToNumber(enemy.accent));
      } else if (role === "boss" && bossVariant >= bossVisuals.length) {
        sprite.setTint(bossCycleTint(bossVariant));
      }
    }
    this.enemyPools.scout.sweep(frame);
    this.enemyPools.hunter.sweep(frame);
    this.enemyPools.brute.sweep(frame);
  }

  private syncBullets(frame: number): void {
    for (const bullet of bullets) {
      if (!this.inView(bullet.x, bullet.y, bullet.radius + 16)) {
        perfStats.culled += 1;
        continue;
      }
      perfStats.drawn += 1;
      const sprite = this.bulletPool.sync(bullet.id, frame);
      const key =
        bullet.color === "#ff5af0"
          ? textureKeys.bulletCrit
          : bullet.color === "#ffbf47"
            ? textureKeys.droneBullet
            : textureKeys.bullet;
      sprite.setTexture(key);
      sprite.setPosition(bullet.x, bullet.y);
      sprite.setRotation(Math.atan2(bullet.vy, bullet.vx));
      sprite.setScale(Math.max(0.45, bullet.radius / 5));
      sprite.setAlpha(0.95);
      sprite.clearTint();
    }
    this.bulletPool.sweep(frame);
  }

  private syncExperience(frame: number): void {
    let visibleXp = 0;
    for (const orb of experienceOrbs) {
      if (visibleXp >= simulationPerfConfig.budgets.maxVisibleXp) {
        perfStats.culled += 1;
        continue;
      }
      if (!this.inView(orb.x, orb.y, orb.radius + 6)) {
        perfStats.culled += 1;
        continue;
      }
      visibleXp += 1;
      perfStats.drawn += 1;
      const sprite = this.xpPool.sync(orb.id, frame);
      sprite.setPosition(orb.x, orb.y);
      sprite.setRotation(world.time * 1.4 + orb.age);
      sprite.setScale((orb.radius * 2) / 22);
      sprite.setAlpha(orb.magnetized ? 0.9 : 0.76);
    }
    this.xpPool.sweep(frame);
  }

  private syncPowerups(frame: number): void {
    for (const orb of powerupOrbs) {
      if (!this.inView(orb.x, orb.y, orb.radius + 10)) {
        perfStats.culled += 1;
        continue;
      }
      perfStats.drawn += 1;
      const sprite = this.powerupPool.sync(orb.id, frame);
      const key =
        orb.kind === "heart"
          ? textureKeys.powerHeart
          : orb.kind === "magnet"
            ? textureKeys.powerMagnet
            : textureKeys.powerBomb;
      sprite.setTexture(key);
      sprite.setPosition(orb.x, orb.y);
      sprite.setRotation(orb.age * 2.2);
      sprite.setScale(1 + Math.sin(orb.age * 7) * 0.08);
      sprite.setAlpha(Math.min(1, orb.life));
    }
    this.powerupPool.sweep(frame);
  }

  private syncChests(frame: number): void {
    for (const chest of chests) {
      if (!this.inView(chest.x, chest.y, chest.radius + 14)) {
        perfStats.culled += 1;
        continue;
      }
      perfStats.drawn += 1;
      const sprite = this.chestPool.sync(chest.id, frame);
      sprite.setPosition(chest.x, chest.y);
      sprite.setRotation(Math.sin(chest.age * 1.8) * 0.08);
      sprite.setScale((chest.radius * 2) / 42);
      sprite.setAlpha(0.96);
      sprite.clearTint();
    }
    this.chestPool.sweep(frame);
  }

  private syncParticles(frame: number): void {
    for (const particle of particles) {
      if (!this.inView(particle.x, particle.y, particle.size + 8)) {
        perfStats.culled += 1;
        continue;
      }
      perfStats.drawn += 1;
      const sprite = this.particlePool.sync(particle.id, frame);
      const alpha = clamp(particle.life / particle.maxLife, 0, 1);
      sprite.setPosition(particle.x, particle.y);
      sprite.setScale(Math.max(0.25, (particle.size * alpha) / 4));
      sprite.setAlpha(alpha);
      sprite.setTint(colorToNumber(particle.color));
      sprite.setDepth(particle.behind ? 8 : 36);
    }
    this.particlePool.sweep(frame);
  }

  private syncFloaters(frame: number): void {
    for (const floater of floaters) {
      if (!this.inView(floater.x, floater.y, 80)) {
        perfStats.culled += 1;
        continue;
      }
      perfStats.drawn += 1;
      const text = this.floaterPool.sync(floater.id, frame);
      const alpha = clamp(floater.life / floater.maxLife, 0, 1);
      text.setText(floater.text);
      text.setPosition(floater.x, floater.y);
      text.setColor(floater.color);
      text.setAlpha(alpha);
    }
    this.floaterPool.sweep(frame);
  }

  private syncDrones(frame: number): void {
    for (let i = 0; i < player.drones; i += 1) {
      const angle = world.time * 1.9 + (Math.PI * 2 * i) / player.drones;
      const x = player.x + Math.cos(angle) * 48;
      const y = player.y + Math.sin(angle) * 48;
      const sprite = this.dronePool.sync(i + 1, frame);
      sprite.setPosition(x, y);
      sprite.setRotation(-angle);
      sprite.setAlpha(0.9);
    }
    this.dronePool.sweep(frame);
  }

  private syncPlayer(): void {
    this.playerShip.setPosition(player.x, player.y);
    this.playerShip.setDisplaySize(player.radius * 2.7, player.radius * 3.1);
    this.playerShip.setRotation(player.aimAngle + Math.PI / 2);
    this.playerShip.setAlpha(player.invuln > 0 && Math.sin(world.time * 42) > 0 ? 0.56 : 1);
  }

  private inView(x: number, y: number, radius: number): boolean {
    return (
      x + radius >= world.cameraX - 48 &&
      x - radius <= world.cameraX + world.width + 48 &&
      y + radius >= world.cameraY - 48 &&
      y - radius <= world.cameraY + world.height + 48
    );
  }
}
