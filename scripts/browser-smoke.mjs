import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const host = "127.0.0.1";
const port = Number(process.env.SMOKE_PORT ?? 4173);
const baseUrl = `http://${host}:${port}`;
const stressSeconds = Number(process.env.SMOKE_SECONDS ?? 20);
const stressEnemies = Number(process.env.SMOKE_ENEMIES ?? 2000);
const stressBullets = Number(process.env.SMOKE_BULLETS ?? 300);
const stressOrbs = Number(process.env.SMOKE_ORBS ?? 1000);
const minP10Fps = Number(process.env.SMOKE_MIN_P10_FPS ?? 55);
const maxP99FrameMs = Number(process.env.SMOKE_MAX_P99_FRAME_MS ?? 20);

function runServer() {
  const child = spawn(
    "npm",
    ["run", "preview", "--", "--host", host, "--port", String(port)],
    {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    },
  );
  child.stdout.on("data", (data) => process.stdout.write(data));
  child.stderr.on("data", (data) => process.stderr.write(data));
  return child;
}

async function waitForServer() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // Preview server is still booting.
    }
    await delay(250);
  }
  throw new Error(`Preview server did not start at ${baseUrl}`);
}

function parseStressReport(text) {
  const jsonStart = text.indexOf("{");
  if (jsonStart < 0) throw new Error("Stress report did not contain JSON");
  return JSON.parse(text.slice(jsonStart));
}

const server = runServer();

try {
  await waitForServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#gameCanvas");
  const startOverlayBefore = await page.locator("#startOverlay.active").count();
  await page.click("#startButton");
  await page.waitForTimeout(800);
  const startOverlayAfter = await page.locator("#startOverlay.active").count();
  const canvasBox = await page.locator("#gameCanvas").boundingBox();

  if (startOverlayBefore !== 1 || startOverlayAfter !== 0 || !canvasBox) {
    throw new Error("Game did not transition from menu to play state");
  }

  const stressUrl =
    `${baseUrl}/?bench=1` +
    `&enemies=${stressEnemies}` +
    `&bullets=${stressBullets}` +
    `&orbs=${stressOrbs}` +
    `&seconds=${stressSeconds}` +
    "&overlay=0";
  await page.goto(stressUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#stressReport", {
    timeout: Math.max(30_000, stressSeconds * 1000 + 10_000),
  });
  const stressReportText = await page.locator("#stressReport").innerText();
  const report = parseStressReport(stressReportText);
  await browser.close();

  if (errors.length > 0) {
    throw new Error(`Browser errors:\n${errors.join("\n")}`);
  }
  if (report.fps_p10 < minP10Fps) {
    throw new Error(`Stress fps_p10 ${report.fps_p10} below ${minP10Fps}`);
  }
  if (report.frame_ms_p99 > maxP99FrameMs) {
    throw new Error(`Stress frame_ms_p99 ${report.frame_ms_p99} above ${maxP99FrameMs}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        menu: { startOverlayBefore, startOverlayAfter, canvasBox },
        stress: report,
      },
      null,
      2,
    ),
  );
} finally {
  server.kill("SIGTERM");
}
