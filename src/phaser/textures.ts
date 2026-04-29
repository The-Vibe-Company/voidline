import * as Phaser from "phaser";
import { balance } from "../game/balance";
import { bossVisuals } from "../game/boss-visuals";
import { colorToNumber } from "../utils";

export const textureKeys = {
  player: "voidline-player",
  bullet: "voidline-bullet",
  bulletCrit: "voidline-bullet-crit",
  droneBullet: "voidline-drone-bullet",
  xp: "voidline-xp",
  particle: "voidline-particle",
  powerHeart: "voidline-power-heart",
  powerMagnet: "voidline-power-magnet",
  powerBomb: "voidline-power-bomb",
  chest: "voidline-chest",
  drone: "voidline-drone",
  enemies: {
    scout: "voidline-enemy-scout",
    hunter: "voidline-enemy-hunter",
    brute: "voidline-enemy-brute",
  },
  miniBosses: {
    scout: "voidline-mini-boss-scout",
    hunter: "voidline-mini-boss-hunter",
    brute: "voidline-mini-boss-brute",
  },
  bosses: bossVisuals.map((boss) => boss.texture),
} as const;

export function createGeneratedTextures(scene: Phaser.Scene): void {
  const graphics = scene.add.graphics();

  generatePlayer(graphics, scene, textureKeys.player);
  generateCircle(graphics, scene, textureKeys.bullet, 22, 0x39d9ff, 0xd9f6ff);
  generateCircle(graphics, scene, textureKeys.bulletCrit, 26, 0xff5af0, 0xffffff);
  generateCircle(graphics, scene, textureKeys.droneBullet, 20, 0xffbf47, 0xfff0b8);
  generateDiamond(graphics, scene, textureKeys.xp, 22, 0x72ffb1, 0xeaffd8);
  generateCircle(graphics, scene, textureKeys.particle, 10, 0xffffff, 0xffffff);
  generateCircle(graphics, scene, textureKeys.drone, 22, 0xffbf47, 0xfff0b8);
  generateCircle(graphics, scene, textureKeys.powerHeart, 30, 0xff5a69, 0xffd0d5);
  generateCircle(graphics, scene, textureKeys.powerMagnet, 30, 0x39d9ff, 0xd9f6ff);
  generateCircle(graphics, scene, textureKeys.powerBomb, 30, 0xffbf47, 0xfff0b8);
  generateChest(graphics, scene, textureKeys.chest);

  for (const enemy of balance.enemies) {
    generateEnemy(graphics, scene, textureKeys.enemies[enemy.id], enemy.id);
    generateEliteEnemy(graphics, scene, textureKeys.miniBosses[enemy.id], enemy.id);
  }
  for (let index = 0; index < textureKeys.bosses.length; index += 1) {
    generateBoss(graphics, scene, textureKeys.bosses[index]!, index);
  }

  graphics.destroy();
}

function skipExisting(scene: Phaser.Scene, key: string): boolean {
  return scene.textures.exists(key);
}

function generatePlayer(
  graphics: Phaser.GameObjects.Graphics,
  scene: Phaser.Scene,
  key: string,
): void {
  if (skipExisting(scene, key)) return;
  graphics.clear();
  graphics.fillStyle(0xd9f6ff, 1);
  graphics.lineStyle(3, 0x39d9ff, 1);
  graphics.fillTriangle(24, 3, 43, 51, 24, 42);
  graphics.fillTriangle(24, 3, 5, 51, 24, 42);
  graphics.strokeTriangle(24, 3, 43, 51, 24, 42);
  graphics.strokeTriangle(24, 3, 5, 51, 24, 42);
  graphics.fillStyle(0x05060b, 1);
  graphics.fillTriangle(24, 18, 31, 37, 17, 37);
  graphics.generateTexture(key, 48, 56);
}

function generateCircle(
  graphics: Phaser.GameObjects.Graphics,
  scene: Phaser.Scene,
  key: string,
  size: number,
  fill: number,
  stroke: number,
): void {
  if (skipExisting(scene, key)) return;
  const center = size / 2;
  graphics.clear();
  graphics.fillStyle(fill, 1);
  graphics.lineStyle(2, stroke, 1);
  graphics.fillCircle(center, center, center - 3);
  graphics.strokeCircle(center, center, center - 3);
  graphics.generateTexture(key, size, size);
}

function generateDiamond(
  graphics: Phaser.GameObjects.Graphics,
  scene: Phaser.Scene,
  key: string,
  size: number,
  fill: number,
  stroke: number,
): void {
  if (skipExisting(scene, key)) return;
  const center = size / 2;
  graphics.clear();
  graphics.fillStyle(fill, 1);
  graphics.lineStyle(2, stroke, 1);
  graphics.beginPath();
  graphics.moveTo(center, 2);
  graphics.lineTo(size - 3, center);
  graphics.lineTo(center, size - 2);
  graphics.lineTo(3, center);
  graphics.closePath();
  graphics.fillPath();
  graphics.strokePath();
  graphics.generateTexture(key, size, size);
}

function generateEnemy(
  graphics: Phaser.GameObjects.Graphics,
  scene: Phaser.Scene,
  key: string,
  kind: "scout" | "hunter" | "brute",
): void {
  if (skipExisting(scene, key)) return;
  const enemy = balance.enemies.find((item) => item.id === kind)!;
  const fill = colorToNumber(enemy.color);
  const stroke = colorToNumber(enemy.accent);
  graphics.clear();
  graphics.fillStyle(fill, 1);
  graphics.lineStyle(3, stroke, 1);
  if (kind === "scout") {
    graphics.fillTriangle(28, 4, 52, 52, 4, 52);
    graphics.strokeTriangle(28, 4, 52, 52, 4, 52);
  } else if (kind === "hunter") {
    graphics.fillRect(10, 10, 36, 36);
    graphics.strokeRect(10, 10, 36, 36);
  } else {
    graphics.fillCircle(30, 30, 25);
    graphics.strokeCircle(30, 30, 25);
  }
  graphics.generateTexture(key, 60, 60);
}

function generateEliteEnemy(
  graphics: Phaser.GameObjects.Graphics,
  scene: Phaser.Scene,
  key: string,
  kind: "scout" | "hunter" | "brute",
): void {
  if (skipExisting(scene, key)) return;
  const enemy = balance.enemies.find((item) => item.id === kind)!;
  const fill = colorToNumber(enemy.color);
  const stroke = colorToNumber(enemy.accent);
  graphics.clear();
  graphics.fillStyle(fill, 1);
  graphics.lineStyle(4, stroke, 1);
  if (kind === "scout") {
    graphics.fillTriangle(40, 4, 74, 76, 6, 76);
    graphics.strokeTriangle(40, 4, 74, 76, 6, 76);
    graphics.fillTriangle(40, 22, 78, 66, 48, 62);
    graphics.fillTriangle(40, 22, 2, 66, 32, 62);
  } else if (kind === "hunter") {
    graphics.fillRect(13, 13, 54, 54);
    graphics.strokeRect(13, 13, 54, 54);
    graphics.fillTriangle(40, 2, 72, 34, 40, 24);
    graphics.fillTriangle(40, 2, 8, 34, 40, 24);
  } else {
    graphics.fillCircle(40, 40, 35);
    graphics.strokeCircle(40, 40, 35);
    graphics.fillCircle(40, 40, 14);
  }
  graphics.generateTexture(key, 80, 80);
}

function generateBoss(
  graphics: Phaser.GameObjects.Graphics,
  scene: Phaser.Scene,
  key: string,
  index: number,
): void {
  if (skipExisting(scene, key)) return;
  const visual = bossVisuals[index]!;
  const fill = colorToNumber(visual.accent);
  const stroke = visual.accent === "#ffffff" ? 0xd9f6ff : 0xffffff;
  graphics.clear();
  graphics.fillStyle(fill, 1);
  graphics.lineStyle(5, stroke, 1);
  const center = 56;

  if (index === 0) {
    graphics.fillTriangle(56, 4, 94, 104, 56, 78);
    graphics.fillTriangle(56, 4, 18, 104, 56, 78);
    graphics.strokeTriangle(56, 4, 94, 104, 56, 78);
    graphics.strokeTriangle(56, 4, 18, 104, 56, 78);
    graphics.fillTriangle(56, 34, 108, 64, 72, 72);
    graphics.fillTriangle(56, 34, 4, 64, 40, 72);
  } else if (index === 1) {
    graphics.fillTriangle(56, 10, 108, 40, 76, 58);
    graphics.fillTriangle(56, 10, 4, 40, 36, 58);
    graphics.fillRect(24, 34, 64, 48);
    graphics.strokeTriangle(56, 10, 108, 40, 76, 58);
    graphics.strokeTriangle(56, 10, 4, 40, 36, 58);
    graphics.strokeRect(24, 34, 64, 48);
    graphics.fillTriangle(56, 104, 98, 68, 70, 72);
    graphics.fillTriangle(56, 104, 14, 68, 42, 72);
  } else if (index === 2) {
    graphics.fillCircle(center, center, 48);
    graphics.strokeCircle(center, center, 48);
    graphics.fillRect(10, 48, 92, 16);
    graphics.fillRect(48, 10, 16, 92);
    graphics.strokeRect(10, 48, 92, 16);
    graphics.strokeRect(48, 10, 16, 92);
  } else if (index === 3) {
    graphics.fillTriangle(56, 4, 72, 108, 40, 108);
    graphics.strokeTriangle(56, 4, 72, 108, 40, 108);
    graphics.fillTriangle(18, 30, 52, 54, 8, 92);
    graphics.fillTriangle(94, 30, 60, 54, 104, 92);
    graphics.strokeTriangle(18, 30, 52, 54, 8, 92);
    graphics.strokeTriangle(94, 30, 60, 54, 104, 92);
  } else if (index === 4) {
    graphics.fillRect(18, 20, 76, 72);
    graphics.strokeRect(18, 20, 76, 72);
    graphics.fillCircle(22, 56, 18);
    graphics.fillCircle(90, 56, 18);
    graphics.strokeCircle(22, 56, 18);
    graphics.strokeCircle(90, 56, 18);
    graphics.fillTriangle(56, 4, 76, 36, 36, 36);
    graphics.fillTriangle(56, 108, 76, 76, 36, 76);
  } else {
    generateStar(graphics, center, center, 48, 22, 8);
    graphics.strokeCircle(center, center, 44);
    graphics.lineStyle(3, 0x05060b, 1);
    graphics.strokeCircle(center, center, 24);
    graphics.lineStyle(5, stroke, 1);
  }

  graphics.fillStyle(0x05060b, 1);
  graphics.fillCircle(center, center, 13);
  graphics.lineStyle(2, stroke, 1);
  graphics.strokeCircle(center, center, 13);
  graphics.generateTexture(key, 112, 112);
}

function generateStar(
  graphics: Phaser.GameObjects.Graphics,
  centerX: number,
  centerY: number,
  outerRadius: number,
  innerRadius: number,
  points: number,
): void {
  graphics.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const angle = -Math.PI / 2 + (Math.PI * i) / points;
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;
    if (i === 0) graphics.moveTo(x, y);
    else graphics.lineTo(x, y);
  }
  graphics.closePath();
  graphics.fillPath();
  graphics.strokePath();
}

function generateChest(
  graphics: Phaser.GameObjects.Graphics,
  scene: Phaser.Scene,
  key: string,
): void {
  if (skipExisting(scene, key)) return;
  graphics.clear();
  graphics.fillStyle(0x201107, 1);
  graphics.lineStyle(3, 0xfff0b8, 1);
  graphics.fillRect(5, 12, 38, 26);
  graphics.strokeRect(5, 12, 38, 26);
  graphics.fillStyle(0xffbf47, 1);
  graphics.fillRect(8, 23, 32, 5);
  graphics.fillRect(21, 12, 6, 26);
  graphics.fillStyle(0xfff0b8, 1);
  graphics.fillRect(19, 20, 10, 10);
  graphics.generateTexture(key, 48, 48);
}
