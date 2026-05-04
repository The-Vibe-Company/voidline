import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const host = "127.0.0.1";
const port = Number(process.env.SMOKE_PORT ?? 4173);
const baseUrl = `http://${host}:${port}`;

function runServer() {
  const child = spawn(
    "npm",
    ["run", "preview", "--", "--host", host, "--port", String(port)],
    { stdio: ["ignore", "pipe", "pipe"], env: process.env },
  );
  child.stdout.on("data", (d) => process.stdout.write(d));
  child.stderr.on("data", (d) => process.stderr.write(d));
  return child;
}

async function waitForServer() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(baseUrl);
      if (r.ok) return;
    } catch {}
    await delay(250);
  }
  throw new Error(`Preview server did not start at ${baseUrl}`);
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
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#gameCanvas");
  const overlayBefore = await page.locator("#hangarOverlay.active").count();
  await page.click("#startButton");
  await page.waitForTimeout(1500);
  const overlayAfter = await page.locator("#hangarOverlay.active").count();

  if (overlayBefore !== 1 || overlayAfter !== 0) {
    throw new Error("Game did not transition from hangar to play state");
  }
  if (errors.length > 0) {
    throw new Error(`Browser errors:\n${errors.join("\n")}`);
  }
  await browser.close();
  console.log(JSON.stringify({ ok: true }, null, 2));
} finally {
  server.kill("SIGTERM");
}
