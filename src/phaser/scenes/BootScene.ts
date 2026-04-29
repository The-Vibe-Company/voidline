import * as Phaser from "phaser";
import { createGeneratedTextures } from "../textures";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  create(): void {
    createGeneratedTextures(this);
    this.scene.start("BattleScene");
  }
}
