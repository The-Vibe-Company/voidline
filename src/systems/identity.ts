const STORAGE_KEY_ID = "voidline:player:id";
const STORAGE_KEY_ALIAS = "voidline:player:alias";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function safeStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function generateUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback: not cryptographically strong but works.
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function getOrCreatePlayerId(): string {
  const storage = safeStorage();
  const existing = storage?.getItem(STORAGE_KEY_ID);
  if (existing && UUID_RE.test(existing)) return existing;
  const fresh = generateUuid();
  storage?.setItem(STORAGE_KEY_ID, fresh);
  return fresh;
}

export function getAlias(): string | null {
  const storage = safeStorage();
  const raw = storage?.getItem(STORAGE_KEY_ALIAS) ?? null;
  if (!raw) return null;
  return raw.trim().slice(0, 24) || null;
}

export function setAlias(alias: string | null): string | null {
  const storage = safeStorage();
  const cleaned = alias ? alias.trim().slice(0, 24) : "";
  if (!cleaned) {
    storage?.removeItem(STORAGE_KEY_ALIAS);
    return null;
  }
  storage?.setItem(STORAGE_KEY_ALIAS, cleaned);
  return cleaned;
}
