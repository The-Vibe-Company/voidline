#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const env = process.env.VERCEL_ENV ?? "unknown";

if (env === "production") {
  console.log(`[vercel-build] VERCEL_ENV=${env} — running schema init`);
  const init = spawnSync("node", ["scripts/db-init.mjs"], { stdio: "inherit" });
  if (init.status !== 0) process.exit(init.status ?? 1);
} else {
  console.log(`[vercel-build] VERCEL_ENV=${env} — skipping schema init`);
}

const build = spawnSync("npm", ["run", "build"], { stdio: "inherit" });
process.exit(build.status ?? 1);
