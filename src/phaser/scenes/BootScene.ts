import * as Phaser from "phaser";
import { createGeneratedTextures, spriteAssets } from "../textures";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  preload(): void {
    for (const asset of spriteAssets) {
      this.load.image(asset.key, asset.path);
    }
  }

  create(): void {
    createGeneratedTextures(this);
    this.scene.start("BattleScene");
  }
}
