import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set");
}

export const sql = neon(url);

export function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isValidIsoDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(s: unknown): s is string {
  return typeof s === "string" && UUID_RE.test(s);
}

export function sanitizeAlias(input: unknown): string | null {
  if (input == null) return null;
  if (typeof input !== "string") return null;
  let cleaned = "";
  for (const ch of input) {
    const code = ch.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) continue;
    cleaned += ch;
  }
  cleaned = cleaned.trim().slice(0, 24);
  return cleaned.length === 0 ? null : cleaned;
}
