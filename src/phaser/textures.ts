import * as Phaser from "phaser";
import { enemyTypes } from "../game/balance";
import { colorToNumber } from "../utils";

export const textureKeys = {
  player: "voidline-player",
  bullet: "voidline-bullet",
  bulletCrit: "voidline-bullet-crit",
  xp: "voidline-xp",
  particle: "voidline-particle",
  enemies: {
    scout: "voidline-enemy-scout",
    hunter: "voidline-enemy-hunter",
    brute: "voidline-enemy-brute",
  },
} as const;

export function createGeneratedTextures(scene: Phaser.Scene): void {
  const graphics = scene.add.graphics();
  generatePlayer(graphics, scene, textureKeys.player);
  generateCircle(graphics, scene, textureKeys.bullet, 22, 0x39d9ff, 0xd9f6ff);
  generateCircle(graphics, scene, textureKeys.bulletCrit, 26, 0xff5af0, 0xffffff);
  generateDiamond(graphics, scene, textureKeys.xp, 22, 0x72ffb1, 0xeaffd8);
  generateCircle(graphics, scene, textureKeys.particle, 10, 0xffffff, 0xffffff);
  for (const enemy of enemyTypes) {
    generateEnemy(graphics, scene, textureKeys.enemies[enemy.id], enemy.id);
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
  const enemy = enemyTypes.find((entry) => entry.id === kind)!;
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
