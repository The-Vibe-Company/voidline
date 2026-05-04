import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomInt } from "node:crypto";
import { sql, todayUtcDate } from "./_db.js";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }
  try {
    const date = todayUtcDate();
    const candidate = randomInt(1, 2_147_483_647);
    // Insert if absent. The CTE returns the existing row if conflict.
    const rows = (await sql.query(
      `WITH ins AS (
         INSERT INTO daily_seeds (seed_date, seed_value)
         VALUES ($1::date, $2::bigint)
         ON CONFLICT (seed_date) DO NOTHING
         RETURNING seed_date, seed_value
       )
       SELECT seed_date, seed_value FROM ins
       UNION ALL
       SELECT seed_date, seed_value FROM daily_seeds WHERE seed_date = $1::date
       LIMIT 1`,
      [date, candidate],
    )) as Array<{ seed_date: string; seed_value: string | number }>;
    const row = rows[0];
    if (!row) {
      res.status(500).json({ error: "Failed to fetch seed" });
      return;
    }
    res.setHeader("Cache-Control", "public, max-age=60");
    res.status(200).json({
      date: typeof row.seed_date === "string" ? row.seed_date.slice(0, 10) : date,
      seed: Number(row.seed_value),
    });
  } catch (err) {
    console.error("api/seed failed:", err);
    res.status(500).json({ error: "Internal error" });
  }
}
