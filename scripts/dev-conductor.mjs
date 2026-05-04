#!/usr/bin/env node
// Dev launcher for Conductor: front (Vite) on $CONDUCTOR_PORT, API (Vercel dev) on $CONDUCTOR_PORT+1.
// Vite proxies /api/* to the Vercel dev server, and waits until that server is ready
// before starting so the first page load doesn't hit ECONNREFUSED.
import { spawn } from "node:child_process";
import { connect } from "node:net";

const FRONT_PORT = Number(process.env.CONDUCTOR_PORT ?? 3000);
const API_PORT = FRONT_PORT + 1;

console.log(`[dev] front (vite)  → http://127.0.0.1:${FRONT_PORT}`);
console.log(`[dev] api  (vercel) → http://127.0.0.1:${API_PORT}`);

const children = [];

function spawnChild(name, cmd, args, env = {}) {
  const child = spawn(cmd, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...env },
  });
  child.stdout.on("data", (b) => process.stdout.write(`[${name}] ${b}`));
  child.stderr.on("data", (b) => process.stderr.write(`[${name}] ${b}`));
  child.on("exit", (code) => {
    console.error(`[${name}] exited with code ${code}`);
    shutdown(code ?? 1);
  });
  children.push(child);
  return child;
}

function shutdown(code = 0) {
  for (const c of children) {
    try {
      c.kill("SIGTERM");
    } catch {}
  }
  setTimeout(() => process.exit(code), 200);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

function probePort(port) {
  return new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function waitForPort(port, timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await probePort(port)) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

spawnChild("api", "vercel", ["dev", "--listen", String(API_PORT)]);

const ok = await waitForPort(API_PORT);
if (!ok) {
  console.error(`[dev] vercel dev did not start on port ${API_PORT} within timeout`);
  shutdown(1);
}

spawnChild("vite", "npx", ["vite", "--port", String(FRONT_PORT), "--strictPort"], {
  VITE_API_PROXY_PORT: String(API_PORT),
});
