import * as Phaser from "phaser";

export interface PooledImage {
  object: Phaser.GameObjects.Image;
  frame: number;
}

export interface PooledText {
  object: Phaser.GameObjects.Text;
  frame: number;
}

export class ImageRenderPool {
  private readonly active = new Map<number, PooledImage>();
  private readonly free: Phaser.GameObjects.Image[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly texture: string,
    private readonly depth: number,
  ) {}

  sync(id: number, frame: number): Phaser.GameObjects.Image {
    let pooled = this.active.get(id);
    if (!pooled) {
      const object = this.free.pop() ?? this.scene.add.image(0, 0, this.texture);
      object.setTexture(this.texture);
      object.setDepth(this.depth);
      object.setActive(true);
      object.setVisible(true);
      pooled = { object, frame };
      this.active.set(id, pooled);
    }
    pooled.frame = frame;
    return pooled.object;
  }

  sweep(frame: number): void {
    for (const [id, pooled] of this.active) {
      if (pooled.frame === frame) continue;
      pooled.object.setVisible(false);
      pooled.object.setActive(false);
      this.free.push(pooled.object);
      this.active.delete(id);
    }
  }

  hideAll(): void {
    for (const [id, pooled] of this.active) {
      pooled.object.setVisible(false);
      pooled.object.setActive(false);
      this.free.push(pooled.object);
      this.active.delete(id);
    }
  }
}

export class TextRenderPool {
  private readonly active = new Map<number, PooledText>();
  private readonly free: Phaser.GameObjects.Text[] = [];

  constructor(private readonly scene: Phaser.Scene) {}

  sync(id: number, frame: number): Phaser.GameObjects.Text {
    let pooled = this.active.get(id);
    if (!pooled) {
      const object =
        this.free.pop() ??
        this.scene.add.text(0, 0, "", {
          color: "#ffffff",
          fontFamily: "Share Tech Mono, ui-monospace, monospace",
          fontSize: "13px",
          fontStyle: "700",
        });
      object.setDepth(80);
      object.setOrigin(0.5);
      object.setActive(true);
      object.setVisible(true);
      pooled = { object, frame };
      this.active.set(id, pooled);
    }
    pooled.frame = frame;
    return pooled.object;
  }

  sweep(frame: number): void {
    for (const [id, pooled] of this.active) {
      if (pooled.frame === frame) continue;
      pooled.object.setVisible(false);
      pooled.object.setActive(false);
      this.free.push(pooled.object);
      this.active.delete(id);
    }
  }
}
