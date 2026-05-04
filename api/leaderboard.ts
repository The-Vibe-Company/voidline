import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql, isValidIsoDate, todayUtcDate } from "./_db.js";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }
  const dateParam = typeof req.query.date === "string" ? req.query.date : undefined;
  const date = dateParam && isValidIsoDate(dateParam) ? dateParam : todayUtcDate();

  try {
    const rows = (await sql.query(
      `SELECT s.score, s.mini_wave, s.run_seconds, s.boss_defeated,
              s.starter_weapon, p.alias, s.created_at
         FROM scores s
         JOIN players p ON p.player_id = s.player_id
        WHERE s.seed_date = $1::date
        ORDER BY s.boss_defeated DESC, s.score DESC, s.run_seconds ASC
        LIMIT 10`,
      [date],
    )) as Array<{
      score: number;
      mini_wave: number;
      run_seconds: number;
      boss_defeated: boolean;
      starter_weapon: string;
      alias: string | null;
      created_at: string;
    }>;

    res.setHeader("Cache-Control", "public, max-age=20");
    res.status(200).json({ date, entries: rows });
  } catch (err) {
    console.error("api/leaderboard failed:", err);
    res.status(500).json({ error: "Internal error" });
  }
}
