import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql, isUuid, sanitizeAlias } from "./_db.js";

function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: unknown }).code;
  return code === "23505";
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const playerId = body.player_id;
  const alias = sanitizeAlias(body.alias);
  if (!isUuid(playerId)) {
    res.status(400).json({ error: "Invalid player_id" });
    return;
  }

  try {
    if (alias != null) {
      // Reject if another player already owns this alias (case-insensitive).
      const taken = (await sql.query(
        `SELECT player_id FROM players
          WHERE alias IS NOT NULL AND lower(alias) = lower($1)
            AND player_id <> $2::uuid
          LIMIT 1`,
        [alias, playerId],
      )) as Array<{ player_id: string }>;
      if (taken.length > 0) {
        res.status(409).json({ error: "alias_taken" });
        return;
      }
    }

    await sql.query(
      `INSERT INTO players (player_id, alias)
       VALUES ($1::uuid, $2)
       ON CONFLICT (player_id) DO UPDATE
         SET alias = EXCLUDED.alias,
             updated_at = now()`,
      [playerId, alias],
    );
    res.status(200).json({ ok: true, alias });
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "alias_taken" });
      return;
    }
    console.error("api/players failed:", err);
    res.status(500).json({ error: "Internal error" });
  }
}
