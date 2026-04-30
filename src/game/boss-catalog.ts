import { bossBalance } from "./balance";
import type { BossDef, BossRole } from "../types";

export const bossCatalog: readonly BossDef[] = [
  {
    id: "default-mini-boss",
    role: "mini-boss",
    label: "MINI-BOSS",
    stats: {
      hpMultiplier: bossBalance.miniBoss.hpMultiplier,
      speedMultiplier: bossBalance.miniBoss.speedMultiplier,
      damageMultiplier: bossBalance.miniBoss.damageMultiplier,
      radiusMultiplier: bossBalance.miniBoss.radiusMultiplier,
      scoreMultiplier: bossBalance.miniBoss.scoreMultiplier,
      contactCooldown: bossBalance.miniBoss.contactCooldown,
      color: "#ffbf47",
      accent: "#fff0b8",
      sides: 6,
      wobble: bossBalance.wobble.miniBoss.value,
      wobbleRate: bossBalance.wobble.miniBoss.rate,
    },
  },
  {
    id: "default-boss",
    role: "boss",
    label: "BOSS",
    stats: {
      hpMultiplier: bossBalance.boss.hpMultiplier,
      speedMultiplier: bossBalance.boss.speedMultiplier,
      damageMultiplier: bossBalance.boss.damageMultiplier,
      radiusMultiplier: bossBalance.boss.radiusMultiplier,
      scoreMultiplier: bossBalance.boss.scoreMultiplier,
      contactCooldown: bossBalance.boss.contactCooldown,
      color: "#ff5a69",
      accent: "#ffffff",
      sides: 8,
      wobble: bossBalance.wobble.boss.value,
      wobbleRate: bossBalance.wobble.boss.rate,
    },
  },
];

const bossByRole = new Map<BossRole, BossDef>(bossCatalog.map((def) => [def.role, def]));

export function findBossDef(role: BossRole): BossDef {
  const def = bossByRole.get(role);
  if (!def) throw new Error(`No boss def for role: ${role}`);
  return def;
}
