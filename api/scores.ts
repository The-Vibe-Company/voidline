import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql, isUuid, isValidIsoDate, todayUtcDate } from "./_db.js";

const MAX_SCORE = 10_000_000;
const MAX_RUN_SECONDS = 120;
const MAX_MINI_WAVE = 6;
const STARTER_WEAPON_RE = /^[a-z][a-z0-9-]{0,23}$/;

function isFiniteInt(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max && Number.isInteger(v);
}

function isFiniteNumber(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const playerId = body.player_id;
  const seedDate = body.seed_date;
  const score = body.score;
  const miniWave = body.mini_wave;
  const runSeconds = body.run_seconds;
  const bossDefeated = body.boss_defeated;
  const starterWeapon = body.starter_weapon;

  if (!isUuid(playerId)) {
    res.status(400).json({ error: "Invalid player_id" });
    return;
  }
  if (!isValidIsoDate(seedDate)) {
    res.status(400).json({ error: "Invalid seed_date" });
    return;
  }
  if (!isFiniteInt(score, 0, MAX_SCORE)) {
    res.status(400).json({ error: "Invalid score" });
    return;
  }
  if (!isFiniteInt(miniWave, 0, MAX_MINI_WAVE)) {
    res.status(400).json({ error: "Invalid mini_wave" });
    return;
  }
  if (!isFiniteNumber(runSeconds, 0, MAX_RUN_SECONDS)) {
    res.status(400).json({ error: "Invalid run_seconds" });
    return;
  }
  if (typeof bossDefeated !== "boolean") {
    res.status(400).json({ error: "Invalid boss_defeated" });
    return;
  }
  if (typeof starterWeapon !== "string" || !STARTER_WEAPON_RE.test(starterWeapon)) {
    res.status(400).json({ error: "Invalid starter_weapon" });
    return;
  }

  // Tolerate yesterday's date too (run started near UTC midnight).
  const today = todayUtcDate();
  const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
  if (seedDate !== today && seedDate !== yesterday) {
    res.status(400).json({ error: "seed_date out of range" });
    return;
  }

  try {
    const seedRows = (await sql.query(
      `SELECT 1 FROM daily_seeds WHERE seed_date = $1::date`,
      [seedDate],
    )) as Array<unknown>;
    if (seedRows.length === 0) {
      res.status(400).json({ error: "Unknown seed_date" });
      return;
    }

    // Ensure a players row exists (anonymous if alias was never set).
    await sql.query(
      `INSERT INTO players (player_id) VALUES ($1::uuid)
       ON CONFLICT (player_id) DO NOTHING`,
      [playerId],
    );

    await sql.query(
      `INSERT INTO scores (player_id, seed_date, score, mini_wave, run_seconds, boss_defeated, starter_weapon)
       VALUES ($1::uuid, $2::date, $3, $4, $5, $6, $7)`,
      [playerId, seedDate, score, miniWave, runSeconds, bossDefeated, starterWeapon],
    );

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("api/scores failed:", err);
    res.status(500).json({ error: "Internal error" });
  }
}
