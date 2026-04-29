import { distanceSq } from "../utils";

export interface SpatialItem {
  x: number;
  y: number;
  radius: number;
}

type VisitItem<T extends SpatialItem> = (item: T) => boolean | void;

export class SpatialGrid<T extends SpatialItem> {
  private readonly buckets = new Map<number, T[]>();

  constructor(readonly cellSize: number) {}

  clear(): void {
    for (const bucket of this.buckets.values()) {
      bucket.length = 0;
    }
  }

  rebuild(items: readonly T[]): void {
    this.clear();
    for (const item of items) {
      this.insert(item);
    }
  }

  insert(item: T): void {
    const cellX = Math.floor(item.x / this.cellSize);
    const cellY = Math.floor(item.y / this.cellSize);
    const key = this.cellKey(cellX, cellY);
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = [];
      this.buckets.set(key, bucket);
    }
    bucket.push(item);
  }

  visitRadius(x: number, y: number, radius: number, visit: VisitItem<T>): void {
    const minCx = Math.floor((x - radius) / this.cellSize);
    const maxCx = Math.floor((x + radius) / this.cellSize);
    const minCy = Math.floor((y - radius) / this.cellSize);
    const maxCy = Math.floor((y + radius) / this.cellSize);

    for (let cy = minCy; cy <= maxCy; cy += 1) {
      for (let cx = minCx; cx <= maxCx; cx += 1) {
        const bucket = this.buckets.get(this.cellKey(cx, cy));
        if (!bucket || bucket.length === 0) continue;
        for (let i = 0; i < bucket.length; i += 1) {
          if (visit(bucket[i]!) === false) return;
        }
      }
    }
  }

  nearest(x: number, y: number, radius: number): T | null {
    let nearest: T | null = null;
    let best = radius * radius;
    this.visitRadius(x, y, radius, (item) => {
      const dist = distanceSq(x, y, item.x, item.y);
      if (dist < best) {
        best = dist;
        nearest = item;
      }
    });
    return nearest;
  }

  private cellKey(cellX: number, cellY: number): number {
    return ((cellX + 0x8000) & 0xffff) | (((cellY + 0x8000) & 0xffff) << 16);
  }
}
