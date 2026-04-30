import { togglePerfOverlay } from "../render/perf-overlay";
import {
  bullets,
  enemies,
  experienceOrbs,
  floaters,
  particles,
  perfStats,
} from "../state";
import { hideOverlays } from "../render/hud";
import { seedRustStress } from "../simulation/rust-engine";

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
  entity_counts: {
    enemies: number;
    bullets: number;
    orbs: number;
  };
  config: StressConfig;
}

interface ActiveStressRun {
  config: StressConfig;
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
    entity_counts: {
      enemies: enemies.length,
      bullets: bullets.length,
      orbs: experienceOrbs.length,
    },
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
  seedRustStress(config);
  particles.length = 0;
  floaters.length = 0;

  if (config.showOverlay) togglePerfOverlay();

  (window as unknown as { compareReports: typeof compareReports }).compareReports = compareReports;

  activeStressRun = {
    config,
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

  const elapsed = (now - run.startedAt) / 1000;
  if (elapsed < run.config.seconds) return;

  run.finished = true;
  if (
    enemies.length !== run.config.enemies ||
    bullets.length !== run.config.bullets ||
    experienceOrbs.length !== run.config.orbs
  ) {
    seedRustStress(run.config);
  }
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
