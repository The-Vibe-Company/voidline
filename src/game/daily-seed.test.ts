import { describe, expect, it } from "vitest";
import { createRng, getDailySeedString, hashSeedString } from "./daily-seed";

describe("daily seed", () => {
  it("getDailySeedString format YYYY-MM-DD using UTC", () => {
    const date = new Date(Date.UTC(2026, 4, 4, 12));
    expect(getDailySeedString(date)).toBe("2026-05-04");
  });

  it("returns the same seed for the same UTC instant regardless of timezone", () => {
    const a = new Date("2026-05-04T23:50:00Z");
    const b = new Date("2026-05-04T00:10:00Z");
    expect(getDailySeedString(a)).toBe(getDailySeedString(b));
  });

  it("hashSeedString is deterministic", () => {
    expect(hashSeedString("2026-05-04")).toBe(hashSeedString("2026-05-04"));
    expect(hashSeedString("2026-05-04")).not.toBe(hashSeedString("2026-05-05"));
  });

  it("createRng with same seed produces same sequence", () => {
    const rngA = createRng(42);
    const rngB = createRng(42);
    for (let i = 0; i < 20; i += 1) {
      expect(rngA.next()).toBe(rngB.next());
    }
  });

  it("range respects bounds", () => {
    const rng = createRng(1);
    for (let i = 0; i < 100; i += 1) {
      const v = rng.range(10, 20);
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThanOrEqual(20);
    }
  });

  it("pick returns one of the list elements", () => {
    const rng = createRng(7);
    const list = ["a", "b", "c"] as const;
    for (let i = 0; i < 50; i += 1) {
      expect(list).toContain(rng.pick(list));
    }
  });
});
