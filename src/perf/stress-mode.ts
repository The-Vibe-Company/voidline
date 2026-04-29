import { togglePerfOverlay } from "../render/perf-overlay";
import {
  bullets,
  counters,
  enemies,
  experienceOrbs,
  floaters,
  particles,
  perfStats,
  player,
  state,
  world,
} from "../state";
import { hideOverlays } from "../render/hud";
import { mulberry32 } from "./rng";
import type { EnemyEntity, EnemyKind } from "../types";
import { balance } from "../game/balance";
import { setSimulationSeed } from "../simulation/random";

interface StressConfig {
  enemies: number;
  bullets: number;
  orbs: number;
  seconds: number;
  seed: number;
  magnet: boolean;
  showOverlay: boolean;
}

interface StressReport {
  frames: number;
  duration_s: number;
  fps_mean: number;
  fps_p50: number;
  fps_p10: number;
  fps_p1: number;
  frame_ms_mean: number;
  frame_ms_p50: number;
  frame_ms_p99: number;
  update_ms_mean: number;
  render_ms_mean: number;
  long_frames_gt_20ms: number;
  config: StressConfig;
}

interface ActiveStressRun {
  config: StressConfig;
  rand: () => number;
  frameTimes: number[];
  updateTimes: number[];
  renderTimes: number[];
  startedAt: number;
  finished: boolean;
}

let activeStressRun: ActiveStressRun | null = null;

function readConfig(): StressConfig | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  if (!params.has("bench")) return null;
  const num = (key: string, fallback: number): number => {
    const v = params.get(key);
    if (v === null) return fallback;
    const parsed = Number(v);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  return {
    enemies: Math.max(0, Math.floor(num("enemies", 120))),
    bullets: Math.max(0, Math.floor(num("bullets", 0))),
    orbs: Math.max(0, Math.floor(num("orbs", 250))),
    seconds: Math.max(1, num("seconds", 10)),
    seed: Math.floor(num("seed", 42)),
    magnet: params.get("magnet") !== "0",
    showOverlay: params.get("overlay") !== "0",
  };
}

function pickEnemyKind(rand: () => number): EnemyKind {
  const r = rand();
  if (r < 0.55) return "scout";
  if (r < 0.85) return "hunter";
  return "brute";
}

function seedEnemies(count: number, rand: () => number): void {
  enemies.length = 0;
  for (let i = 0; i < count; i += 1) {
    const kind = pickEnemyKind(rand);
    const type = balance.enemies.find((e) => e.id === kind)!;
    const enemy: EnemyEntity = {
      id: counters.nextEnemyId,
      kind,
      score: type.score,
      radius: type.radius,
      hp: type.hp,
      maxHp: type.hp,
      speed: type.speed,
      damage: type.damage,
      color: type.color,
      accent: type.accent,
      sides: type.sides,
      x: 100 + rand() * (world.arenaWidth - 200),
      y: 100 + rand() * (world.arenaHeight - 200),
      age: rand() * 5,
      seed: rand() * 100,
      wobble: kind === "brute" ? 0.08 : 0.18,
      wobbleRate: 2 + rand() * 2,
      hit: 0,
    };
    enemies.push(enemy);
    counters.nextEnemyId += 1;
  }
}

function seedOrbs(count: number, rand: () => number): void {
  experienceOrbs.length = 0;
  for (let i = 0; i < count; i += 1) {
    experienceOrbs.push({
      id: counters.nextExperienceId,
      x: 100 + rand() * (world.arenaWidth - 200),
      y: 100 + rand() * (world.arenaHeight - 200),
      vx: (rand() - 0.5) * 60,
      vy: (rand() - 0.5) * 60,
      radius: 6 + rand() * 3,
      value: 1 + Math.floor(rand() * 5),
      age: rand() * 0.4,
      magnetized: false,
    });
    counters.nextExperienceId += 1;
  }
}

function seedBullets(count: number, rand: () => number): void {
  bullets.length = 0;
  for (let i = 0; i < count; i += 1) {
    const angle = rand() * Math.PI * 2;
    bullets.push({
      id: counters.nextBulletId,
      x: 100 + rand() * (world.arenaWidth - 200),
      y: 100 + rand() * (world.arenaHeight - 200),
      vx: Math.cos(angle) * 520,
      vy: Math.sin(angle) * 520,
      radius: 5,
      damage: 4,
      pierce: 1,
      life: 1.15,
      color: "#39d9ff",
      trail: 0,
      hitIds: new Set<number>(),
      source: "player",
      chainRemaining: 0,
    });
    counters.nextBulletId += 1;
  }
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
  return sorted[idx]!;
}

function summarize(
  frameTimes: number[],
  updateTimes: number[],
  renderTimes: number[],
  duration: number,
  config: StressConfig,
): StressReport {
  const sortedFrame = [...frameTimes].sort((a, b) => a - b);
  const fps = frameTimes.map((ms) => (ms > 0 ? 1000 / ms : 0));
  const sortedFps = [...fps].sort((a, b) => a - b);
  const sum = (arr: number[]): number => arr.reduce((a, b) => a + b, 0);
  const mean = (arr: number[]): number => (arr.length ? sum(arr) / arr.length : 0);
  return {
    frames: frameTimes.length,
    duration_s: Number(duration.toFixed(2)),
    fps_mean: Number(mean(fps).toFixed(2)),
    fps_p50: Number(quantile(sortedFps, 0.5).toFixed(2)),
    fps_p10: Number(quantile(sortedFps, 0.1).toFixed(2)),
    fps_p1: Number(quantile(sortedFps, 0.01).toFixed(2)),
    frame_ms_mean: Number(mean(frameTimes).toFixed(2)),
    frame_ms_p50: Number(quantile(sortedFrame, 0.5).toFixed(2)),
    frame_ms_p99: Number(quantile(sortedFrame, 0.99).toFixed(2)),
    update_ms_mean: Number(mean(updateTimes).toFixed(3)),
    render_ms_mean: Number(mean(renderTimes).toFixed(3)),
    long_frames_gt_20ms: frameTimes.filter((m) => m > 20).length,
    config,
  };
}

export function compareReports(before: StressReport, after: StressReport): Record<string, string> {
  const pct = (a: number, b: number): string => {
    if (a === 0) return "n/a";
    const delta = ((b - a) / a) * 100;
    const sign = delta >= 0 ? "+" : "";
    return `${sign}${delta.toFixed(1)}%`;
  };
  return {
    fps_mean: `${before.fps_mean} -> ${after.fps_mean} (${pct(before.fps_mean, after.fps_mean)})`,
    fps_p10: `${before.fps_p10} -> ${after.fps_p10} (${pct(before.fps_p10, after.fps_p10)})`,
    frame_ms_p99: `${before.frame_ms_p99} -> ${after.frame_ms_p99} (${pct(
      before.frame_ms_p99,
      after.frame_ms_p99,
    )})`,
    update_ms_mean: `${before.update_ms_mean} -> ${after.update_ms_mean} (${pct(
      before.update_ms_mean,
      after.update_ms_mean,
    )})`,
    render_ms_mean: `${before.render_ms_mean} -> ${after.render_ms_mean} (${pct(
      before.render_ms_mean,
      after.render_ms_mean,
    )})`,
    long_frames_gt_20ms: `${before.long_frames_gt_20ms} -> ${after.long_frames_gt_20ms}`,
  };
}

export function maybeStartStressMode(): void {
  const config = readConfig();
  if (!config) return;

  hideOverlays();
  state.mode = "playing";
  state.wave = 1;
  state.spawnRemaining = 0;
  state.spawnTimer = Number.POSITIVE_INFINITY;
  state.waveTarget = config.enemies;
  player.x = world.arenaWidth / 2;
  player.y = world.arenaHeight / 2;
  player.hp = 1e9;
  player.maxHp = 1e9;
  player.invuln = 1e9;
  counters.nextEnemyId = 1;
  counters.nextBulletId = 1;
  counters.nextExperienceId = 1;

  const rand = mulberry32(config.seed);
  setSimulationSeed(config.seed);
  bullets.length = 0;
  seedEnemies(config.enemies, rand);
  seedBullets(config.bullets, rand);
  seedOrbs(config.orbs, rand);
  if (config.magnet) {
    for (const orb of experienceOrbs) orb.magnetized = true;
  }
  particles.length = 0;
  floaters.length = 0;

  if (config.showOverlay) togglePerfOverlay();

  (window as unknown as { compareReports: typeof compareReports }).compareReports = compareReports;

  activeStressRun = {
    config,
    rand,
    frameTimes: [],
    updateTimes: [],
    renderTimes: [],
    startedAt: performance.now(),
    finished: false,
  };
}

export function recordStressFrame(now: number): void {
  const run = activeStressRun;
  if (!run || run.finished) return;
  run.frameTimes.push(perfStats.frameMs);
  run.updateTimes.push(perfStats.updateMs);
  run.renderTimes.push(perfStats.renderMs);

  if (run.config.enemies > 0 && enemies.length < run.config.enemies / 2) {
    seedEnemies(run.config.enemies, run.rand);
  }
  if (run.config.bullets > 0 && bullets.length < run.config.bullets / 2) {
    seedBullets(run.config.bullets, run.rand);
  }
  if (run.config.orbs > 0 && experienceOrbs.length < run.config.orbs / 2) {
    seedOrbs(run.config.orbs, run.rand);
    if (run.config.magnet) {
      for (const orb of experienceOrbs) orb.magnetized = true;
    }
  }

  const elapsed = (now - run.startedAt) / 1000;
  if (elapsed < run.config.seconds) return;

  run.finished = true;
  const report = summarize(
    run.frameTimes,
    run.updateTimes,
    run.renderTimes,
    elapsed,
    run.config,
  );
  // eslint-disable-next-line no-console
  console.log("[stress-mode] report", JSON.stringify(report, null, 2));
  attachReportToDom(report);
  activeStressRun = null;
}

function attachReportToDom(report: StressReport): void {
  const div = document.createElement("div");
  div.id = "stressReport";
  div.style.cssText = [
    "position:fixed",
    "left:8px",
    "bottom:8px",
    "z-index:9999",
    "background:rgba(5,6,11,0.92)",
    "color:#72ffb1",
    "border:1px solid rgba(114,255,177,0.4)",
    "border-radius:6px",
    "padding:10px 12px",
    "font:11px/1.4 'Share Tech Mono', ui-monospace, monospace",
    "max-width:320px",
    "white-space:pre",
  ].join(";");
  div.textContent = `STRESS REPORT\n${JSON.stringify(report, null, 2)}`;
  document.body.appendChild(div);
}
