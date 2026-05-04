#!/usr/bin/env node
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

function loadEnvLocal() {
  try {
    const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
}

loadEnvLocal();
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (try .env.local)");
  process.exit(1);
}

const sql = neon(url);

const statements = [
  `CREATE TABLE IF NOT EXISTS daily_seeds (
    seed_date date PRIMARY KEY,
    seed_value bigint NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS players (
    player_id uuid PRIMARY KEY,
    alias text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS scores (
    id bigserial PRIMARY KEY,
    player_id uuid NOT NULL REFERENCES players(player_id),
    seed_date date NOT NULL REFERENCES daily_seeds(seed_date),
    score integer NOT NULL,
    mini_wave smallint NOT NULL,
    run_seconds real NOT NULL,
    boss_defeated boolean NOT NULL DEFAULT false,
    starter_weapon text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS scores_seed_rank_idx
    ON scores (seed_date, boss_defeated DESC, score DESC, run_seconds ASC)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS players_alias_lower_unique
    ON players (lower(alias)) WHERE alias IS NOT NULL`,
];

for (const stmt of statements) {
  process.stdout.write(`- ${stmt.split("\n")[0].trim()}…`);
  await sql.query(stmt);
  process.stdout.write(" ok\n");
}

console.log("DB schema ready.");
