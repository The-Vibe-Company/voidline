import * as Phaser from "phaser";
import {
  attackTelegraphs,
  bullets,
  enemies,
  enemyBullets,
  experienceOrbs,
  floaters,
  particles,
  player,
  pointer,
  spawnIndicators,
  state,
  world,
} from "../../state";
import { update } from "../../systems/run";
import { updateHud } from "../../render/hud";
import { clamp, colorToNumber, screenToWorld } from "../../utils";
import { ImageRenderPool, TextRenderPool } from "../pools";
import { textureKeys } from "../textures";

export class BattleScene extends Phaser.Scene {
  private readonly enemyPools = {
    scout: new ImageRenderPool(this, textureKeys.enemies.scout, 20),
    hunter: new ImageRenderPool(this, textureKeys.enemies.hunter, 20),
    brute: new ImageRenderPool(this, textureKeys.enemies.brute, 20),
    sentinel: new ImageRenderPool(this, textureKeys.enemies.sentinel, 20),
    stinger: new ImageRenderPool(this, textureKeys.enemies.stinger, 20),
    splitter: new ImageRenderPool(this, textureKeys.enemies.splitter, 20),
  };
  private readonly bulletPool = new ImageRenderPool(this, textureKeys.bullet, 30);
  private readonly enemyBulletPool = new ImageRenderPool(this, textureKeys.enemyBullet, 28);
  private readonly xpPool = new ImageRenderPool(this, textureKeys.xp, 15);
  private readonly spawnIndicatorPool = new ImageRenderPool(this, textureKeys.particle, 8);
  private readonly attackTelegraphPool = new ImageRenderPool(this, textureKeys.particle, 9);
  private readonly particlePool = new ImageRenderPool(this, textureKeys.particle, 10);
  private readonly floaterPool = new TextRenderPool(this);
  private playerShip!: Phaser.GameObjects.Image;
  private background!: Phaser.GameObjects.Graphics;
  private worldGuides!: Phaser.GameObjects.Graphics;
  private attackLines!: Phaser.GameObjects.Graphics;
  private renderFrame = 0;
  private hudTimer = 0;
  private lastMoveAngle = -Math.PI / 2;

  constructor() {
    super("BattleScene");
  }

  create(): void {
    this.background = this.add.graphics();
    this.background.setScrollFactor(0);
    this.background.setDepth(-100);
    this.worldGuides = this.add.graphics();
    this.worldGuides.setDepth(5);
    this.attackLines = this.add.graphics();
    this.attackLines.setDepth(9);
    this.playerShip = this.add.image(player.x, player.y, textureKeys.player);
    this.playerShip.setDepth(40);
    this.playerShip.setScale(0.42);
    this.cameras.main.setBounds(0, 0, world.arenaWidth, world.arenaHeight);
  }

  override update(_time: number, delta: number): void {
    const dt = delta / 1000;
    update(dt);
    this.renderFrame += 1;
    this.syncCamera();
    this.drawBackground();
    this.drawWorldGuides();
    this.syncEntities();

    this.hudTimer += delta;
    if (this.hudTimer >= 80) {
      updateHud();
      this.hudTimer = 0;
    }
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
    if (state.mode === "playing" && state.controlMode === "trackpad" && pointer.inside) {
      const target = screenToWorld(pointer.x, pointer.y);
      const distance = Math.hypot(target.x - player.x, target.y - player.y);
      if (distance > 16) {
        const alpha = clamp(distance / 240, 0.16, 0.48);
        this.worldGuides.lineStyle(1, 0x72ffb1, alpha);
        this.worldGuides.beginPath();
        this.worldGuides.moveTo(player.x, player.y);
        this.worldGuides.lineTo(target.x, target.y);
        this.worldGuides.strokePath();
        this.worldGuides.strokeCircle(target.x, target.y, 10 + Math.sin(world.time * 8) * 2);
      }
    }
  }

  private syncEntities(): void {
    const frame = this.renderFrame;
    this.syncExperience(frame);
    this.syncSpawnIndicators(frame);
    this.syncAttackTelegraphs(frame);
    this.syncBullets(frame);
    this.syncEnemyBullets(frame);
    this.syncEnemies(frame);
    this.syncPlayer();
    this.syncParticles(frame);
    this.syncFloaters(frame);
  }

  private syncEnemies(frame: number): void {
    for (const enemy of enemies) {
      if (!this.inView(enemy.x, enemy.y, enemy.radius + 8)) continue;
      const sprite = this.enemyPools[enemy.kind].sync(enemy.id, frame);
      sprite.setPosition(enemy.x, enemy.y);
      sprite.setRotation(enemy.age * (enemy.kind === "brute" ? 0.7 : 1.6));
      sprite.setScale((enemy.radius * 2.25) / 60);
      sprite.setAlpha(1);
      sprite.setTint(
        enemy.hit > 0
          ? colorToNumber(enemy.accent)
          : enemy.isBoss
            ? colorToNumber(enemy.color)
            : 0xffffff,
      );
    }
    this.enemyPools.scout.sweep(frame);
    this.enemyPools.hunter.sweep(frame);
    this.enemyPools.brute.sweep(frame);
    this.enemyPools.sentinel.sweep(frame);
    this.enemyPools.stinger.sweep(frame);
    this.enemyPools.splitter.sweep(frame);
  }

  private syncEnemyBullets(frame: number): void {
    for (const bullet of enemyBullets) {
      if (!this.inView(bullet.x, bullet.y, bullet.radius + 16)) continue;
      const sprite = this.enemyBulletPool.sync(bullet.id, frame);
      sprite.setPosition(bullet.x, bullet.y);
      sprite.setRotation(Math.atan2(bullet.vy, bullet.vx));
      sprite.setScale(Math.max(0.5, bullet.radius / 6));
      sprite.setAlpha(0.95);
      sprite.setTint(colorToNumber(bullet.color));
    }
    this.enemyBulletPool.sweep(frame);
  }

  private syncAttackTelegraphs(frame: number): void {
    this.attackLines.clear();
    for (const telegraph of attackTelegraphs) {
      const progress = clamp(1 - telegraph.life / telegraph.maxLife, 0, 1);
      const colorNum = colorToNumber(telegraph.color);
      if (telegraph.shape === "circle") {
        if (!this.inView(telegraph.x, telegraph.y, telegraph.radius * 4)) continue;
        const sprite = this.attackTelegraphPool.sync(telegraph.id, frame);
        const radius = telegraph.radius * (2.4 - progress * 1.4);
        const pulse = Math.sin(progress * Math.PI);
        sprite.setPosition(telegraph.x, telegraph.y);
        sprite.setScale(Math.max(0.45, (radius * 2) / 24));
        sprite.setAlpha(clamp(0.32 + pulse * 0.36, 0.18, 0.74));
        sprite.setTint(colorNum);
      } else {
        const ex = telegraph.x + Math.cos(telegraph.angle) * telegraph.length;
        const ey = telegraph.y + Math.sin(telegraph.angle) * telegraph.length;
        const alpha = clamp(0.18 + progress * 0.58, 0.18, 0.78);
        this.attackLines.lineStyle(3 + progress * 2, colorNum, alpha);
        this.attackLines.beginPath();
        this.attackLines.moveTo(telegraph.x, telegraph.y);
        this.attackLines.lineTo(ex, ey);
        this.attackLines.strokePath();
      }
    }
    this.attackTelegraphPool.sweep(frame);
  }

  private syncBullets(frame: number): void {
    for (const bullet of bullets) {
      if (!this.inView(bullet.x, bullet.y, bullet.radius + 16)) continue;
      const sprite = this.bulletPool.sync(bullet.id, frame);
      sprite.setTexture(textureKeys.bullet);
      sprite.setPosition(bullet.x, bullet.y);
      sprite.setRotation(Math.atan2(bullet.vy, bullet.vx));
      sprite.setScale(Math.max(0.45, bullet.radius / 5));
      sprite.setAlpha(0.95);
    }
    this.bulletPool.sweep(frame);
  }

  private syncExperience(frame: number): void {
    for (const orb of experienceOrbs) {
      if (!this.inView(orb.x, orb.y, orb.radius + 6)) continue;
      const sprite = this.xpPool.sync(orb.id, frame);
      sprite.setPosition(orb.x, orb.y);
      sprite.setRotation(world.time * 1.4 + orb.age);
      sprite.setScale((orb.radius * 2) / 22);
      sprite.setAlpha(0.85);
    }
    this.xpPool.sweep(frame);
  }

  private syncParticles(frame: number): void {
    for (const particle of particles) {
      if (!this.inView(particle.x, particle.y, particle.size + 8)) continue;
      const sprite = this.particlePool.sync(particle.id, frame);
      const alpha = clamp(particle.life / particle.maxLife, 0, 1);
      sprite.setPosition(particle.x, particle.y);
      sprite.setScale(Math.max(0.25, (particle.size * alpha) / 4));
      sprite.setAlpha(alpha);
      sprite.setTint(colorToNumber(particle.color));
    }
    this.particlePool.sweep(frame);
  }

  private syncSpawnIndicators(frame: number): void {
    for (const indicator of spawnIndicators) {
      if (!this.inView(indicator.x, indicator.y, indicator.radius * 4)) continue;
      const sprite = this.spawnIndicatorPool.sync(indicator.id, frame);
      const progress = clamp(1 - indicator.life / indicator.maxLife, 0, 1);
      const radius = indicator.radius * (3 - progress * 2);
      const pulse = Math.sin(progress * Math.PI);
      sprite.setPosition(indicator.x, indicator.y);
      sprite.setScale(Math.max(0.45, (radius * 2) / 24));
      sprite.setAlpha(clamp(0.3 + pulse * 0.34, 0.2, 0.64));
      sprite.setTint(colorToNumber(indicator.color));
    }
    this.spawnIndicatorPool.sweep(frame);
  }

  private syncFloaters(frame: number): void {
    for (const floater of floaters) {
      if (!this.inView(floater.x, floater.y, 80)) continue;
      const text = this.floaterPool.sync(floater.id, frame);
      const alpha = clamp(floater.life / floater.maxLife, 0, 1);
      text.setText(floater.text);
      text.setPosition(floater.x, floater.y);
      text.setColor(floater.color);
      text.setAlpha(alpha);
    }
    this.floaterPool.sweep(frame);
  }

  private syncPlayer(): void {
    this.playerShip.setPosition(player.x, player.y);
    if (player.vx !== 0 || player.vy !== 0) {
      this.lastMoveAngle = Math.atan2(player.vy, player.vx);
    }
    this.playerShip.setRotation(this.lastMoveAngle + Math.PI / 2);
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
