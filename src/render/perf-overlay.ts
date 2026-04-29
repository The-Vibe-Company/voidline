import {
  bullets,
  enemies,
  experienceOrbs,
  floaters,
  particles,
  perfStats,
  powerupOrbs,
} from "../state";

interface OverlayState {
  enabled: boolean;
  el: HTMLDivElement | null;
  fpsEma: number;
  updateMsEma: number;
  renderMsEma: number;
  frameMsEma: number;
  longFrameWindowMax: number;
  longFrameWindowReset: number;
  longFrameCount: number;
  textEl: HTMLPreElement | null;
}

const overlay: OverlayState = {
  enabled: false,
  el: null,
  fpsEma: 60,
  updateMsEma: 0,
  renderMsEma: 0,
  frameMsEma: 0,
  longFrameWindowMax: 0,
  longFrameWindowReset: 0,
  longFrameCount: 0,
  textEl: null,
};

const EMA_ALPHA = 0.12;
const LONG_FRAME_MS = 20;

function ensureDom(): void {
  if (overlay.el) return;
  const root = document.createElement("div");
  root.id = "perfOverlay";
  root.style.cssText = [
    "position:fixed",
    "top:8px",
    "right:8px",
    "z-index:9999",
    "background:rgba(5,6,11,0.78)",
    "color:#d9f6ff",
    "border:1px solid rgba(57,217,255,0.35)",
    "border-radius:6px",
    "padding:8px 10px",
    "font:11px/1.35 'Share Tech Mono', ui-monospace, monospace",
    "min-width:170px",
    "pointer-events:none",
    "letter-spacing:0.02em",
  ].join(";");
  const pre = document.createElement("pre");
  pre.style.cssText = "margin:0;color:inherit;font:inherit;white-space:pre";
  root.appendChild(pre);
  document.body.appendChild(root);
  overlay.el = root;
  overlay.textEl = pre;
}

function destroyDom(): void {
  if (!overlay.el) return;
  overlay.el.remove();
  overlay.el = null;
  overlay.textEl = null;
}

export function bindPerfOverlay(): void {
  window.addEventListener("keydown", (event) => {
    if (event.key === "F3") {
      event.preventDefault();
      togglePerfOverlay();
    }
  });
}

export function togglePerfOverlay(): void {
  overlay.enabled = !overlay.enabled;
  if (overlay.enabled) {
    ensureDom();
  } else {
    destroyDom();
  }
}

export function isPerfOverlayEnabled(): boolean {
  return overlay.enabled;
}

function ema(prev: number, next: number): number {
  return prev + (next - prev) * EMA_ALPHA;
}

function fmt(value: number, digits = 1): string {
  return value.toFixed(digits);
}

export function recordFrame(now: number, dt: number): void {
  if (!overlay.enabled) return;
  const fps = dt > 0 ? 1 / dt : 0;
  overlay.fpsEma = ema(overlay.fpsEma, fps);
  overlay.updateMsEma = ema(overlay.updateMsEma, perfStats.updateMs);
  overlay.renderMsEma = ema(overlay.renderMsEma, perfStats.renderMs);
  overlay.frameMsEma = ema(overlay.frameMsEma, perfStats.frameMs);

  if (perfStats.frameMs > overlay.longFrameWindowMax) {
    overlay.longFrameWindowMax = perfStats.frameMs;
  }
  if (perfStats.frameMs > LONG_FRAME_MS) {
    overlay.longFrameCount += 1;
  }
  if (now - overlay.longFrameWindowReset > 2000) {
    overlay.longFrameWindowReset = now;
    overlay.longFrameWindowMax = perfStats.frameMs;
    overlay.longFrameCount = 0;
  }

  if (!overlay.textEl) return;
  const totalDraws = perfStats.drawn + perfStats.culled;
  const cullPct = totalDraws > 0 ? (perfStats.culled / totalDraws) * 100 : 0;
  overlay.textEl.textContent = [
    `FPS    ${fmt(overlay.fpsEma)}`,
    `frame  ${fmt(overlay.frameMsEma)}ms`,
    `  upd  ${fmt(overlay.updateMsEma, 2)}ms`,
    `  rnd  ${fmt(overlay.renderMsEma, 2)}ms`,
    `peak2s ${fmt(overlay.longFrameWindowMax)}ms`,
    `>20ms  ${overlay.longFrameCount}`,
    `enem   ${enemies.length}`,
    `bull   ${bullets.length}`,
    `xp     ${experienceOrbs.length}`,
    `pow    ${powerupOrbs.length}`,
    `part   ${particles.length}`,
    `flt    ${floaters.length}`,
    `coll   ${perfStats.collisionChecks}`,
    `drawn  ${perfStats.drawn}`,
    `cull   ${perfStats.culled} (${fmt(cullPct, 0)}%)`,
  ].join("\n");
}
