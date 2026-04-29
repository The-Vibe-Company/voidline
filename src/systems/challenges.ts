import { player } from "../state";
import { pulseText } from "../entities/particles";
import {
  challengeCatalog,
  createEmptyChallengeProgress,
  totalPermanentBonus,
  totalUnlockedTiers,
} from "../game/challenge-catalog";
import { createPlayerState, recomputeMultiplicativeStats } from "../game/balance";
import type { ChallengeMetric, ChallengeProgress, Player } from "../types";

const STORAGE_KEY = "voidline:challengeProgress";

interface ChallengeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const challengeProgress: ChallengeProgress = createEmptyChallengeProgress();

let notifiedTierTotal = 0;
let challengeTrackingEnabled = true;

function getStorage(): ChallengeStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function sanitizeProgress(raw: unknown): ChallengeProgress {
  const clean = createEmptyChallengeProgress();
  if (!raw || typeof raw !== "object") return clean;
  const source = raw as Partial<Record<ChallengeMetric, unknown>>;
  for (const metric of Object.keys(clean) as ChallengeMetric[]) {
    const value = source[metric];
    clean[metric] = typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
  }
  return clean;
}

function parseStoredProgress(raw: string | null): ChallengeProgress {
  if (!raw) return createEmptyChallengeProgress();
  try {
    return sanitizeProgress(JSON.parse(raw));
  } catch {
    return createEmptyChallengeProgress();
  }
}

function assignProgress(next: ChallengeProgress): void {
  Object.assign(challengeProgress, next);
}

export function initializeChallenges(storage: ChallengeStorage | null = getStorage()): void {
  assignProgress(parseStoredProgress(storage?.getItem(STORAGE_KEY) ?? null));
  notifiedTierTotal = totalUnlockedTiers(challengeProgress);
}

export function saveChallengeProgress(storage: ChallengeStorage | null = getStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(challengeProgress));
  } catch {
    // Storage can be unavailable in private browsing or embedded test environments.
  }
}

export function resetChallengeProgress(storage: ChallengeStorage | null = getStorage()): void {
  assignProgress(createEmptyChallengeProgress());
  notifiedTierTotal = 0;
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    // Keep the in-memory reset even when storage is blocked.
  }
}

export function restoreChallengeProgress(progress: ChallengeProgress): void {
  assignProgress(sanitizeProgress(progress));
  notifiedTierTotal = totalUnlockedTiers(challengeProgress);
}

export function recordChallengeProgress(
  metric: ChallengeMetric,
  value: number,
  storage: ChallengeStorage | null = getStorage(),
): boolean {
  if (!challengeTrackingEnabled) return false;
  const current = challengeProgress[metric] ?? 0;
  const next = Math.max(current, Math.floor(value));
  if (next === current) return false;

  const previousTierTotal = totalUnlockedTiers(challengeProgress);
  challengeProgress[metric] = next;
  saveChallengeProgress(storage);
  announceNewChallengeTiers(previousTierTotal);
  return true;
}

export function incrementChallengeProgress(
  metric: Extract<ChallengeMetric, "bossKills" | "totalKills">,
  amount = 1,
  storage: ChallengeStorage | null = getStorage(),
): boolean {
  if (!challengeTrackingEnabled) return false;
  const previousTierTotal = totalUnlockedTiers(challengeProgress);
  challengeProgress[metric] = Math.max(0, Math.floor((challengeProgress[metric] ?? 0) + amount));
  saveChallengeProgress(storage);
  announceNewChallengeTiers(previousTierTotal);
  return true;
}

export function applyPermanentBonuses(target: Player = player): void {
  const bonus = totalPermanentBonus(challengeProgress);
  target.bonus.fireRatePct += bonus.fireRatePct ?? 0;
  target.bonus.damagePct += bonus.damagePct ?? 0;
  target.bonus.speedPct += bonus.speedPct ?? 0;
  target.bonus.pickupRadiusPct += bonus.pickupRadiusPct ?? 0;
  recomputeMultiplicativeStats(target);

  const maxHpFlat = bonus.maxHpFlat ?? 0;
  if (maxHpFlat > 0) {
    target.maxHp += maxHpFlat;
    target.hp += maxHpFlat;
  }
}

export function resetPlayerPermanentBonuses(target: Player = player): void {
  Object.assign(
    target,
    createPlayerState({
      x: target.x,
      y: target.y,
      aimAngle: target.aimAngle,
    }),
  );
  applyPermanentBonuses(target);
}

export function currentChallengeProgress(): ChallengeProgress {
  return { ...challengeProgress };
}

export function setChallengeTrackingEnabled(enabled: boolean): void {
  challengeTrackingEnabled = enabled;
}

export function isChallengeTrackingEnabled(): boolean {
  return challengeTrackingEnabled;
}

function announceNewChallengeTiers(previousTierTotal: number): void {
  const nextTierTotal = totalUnlockedTiers(challengeProgress);
  if (nextTierTotal <= previousTierTotal || nextTierTotal <= notifiedTierTotal) return;
  const gained = nextTierTotal - Math.max(previousTierTotal, notifiedTierTotal);
  notifiedTierTotal = nextTierTotal;

  const label = gained > 1 ? `+${gained} bonus permanents` : "Bonus permanent";
  pulseText(player.x, player.y - 72, label, "#72ffb1");
}

export function challengeSummary(): string {
  const unlocked = totalUnlockedTiers(challengeProgress);
  const total = challengeCatalog.reduce((sum, challenge) => sum + challenge.tiers.length, 0);
  return `${unlocked}/${total}`;
}
