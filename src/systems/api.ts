export interface DailySeedResponse {
  date: string;
  seed: number;
}

export interface LeaderboardEntryResponse {
  score: number;
  mini_wave: number;
  run_seconds: number;
  boss_defeated: boolean;
  starter_weapon: string;
  alias: string | null;
  created_at: string;
}

export interface LeaderboardResponse {
  date: string;
  entries: readonly LeaderboardEntryResponse[];
}

export interface ScoreSubmission {
  player_id: string;
  seed_date: string;
  score: number;
  mini_wave: number;
  run_seconds: number;
  boss_defeated: boolean;
  starter_weapon: string;
}

const BASE = ""; // same-origin

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, init);
  if (!res.ok) {
    throw new Error(`API ${url} failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export function fetchDailySeed(): Promise<DailySeedResponse> {
  return fetchJson<DailySeedResponse>("/api/seed");
}

export type UpsertPlayerResult =
  | { ok: true; alias: string | null }
  | { ok: false; reason: "taken" | "network" };

export async function upsertPlayer(
  playerId: string,
  alias: string | null,
): Promise<UpsertPlayerResult> {
  try {
    const res = await fetch(`${BASE}/api/players`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player_id: playerId, alias }),
    });
    if (res.status === 409) return { ok: false, reason: "taken" };
    if (!res.ok) return { ok: false, reason: "network" };
    const body = (await res.json()) as { alias: string | null };
    return { ok: true, alias: body.alias };
  } catch {
    return { ok: false, reason: "network" };
  }
}

export function postScore(payload: ScoreSubmission): Promise<{ ok: boolean }> {
  return fetchJson("/api/scores", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function fetchLeaderboard(date: string): Promise<LeaderboardResponse> {
  const qs = encodeURIComponent(date);
  return fetchJson<LeaderboardResponse>(`/api/leaderboard?date=${qs}`);
}
