export const bossVisuals = [
  {
    name: "Crimson Needle",
    texture: "voidline-boss-wave-10",
    accent: "#ff5a69",
  },
  {
    name: "Gilded Maw",
    texture: "voidline-boss-wave-20",
    accent: "#ffbf47",
  },
  {
    name: "Violet Bastion",
    texture: "voidline-boss-wave-30",
    accent: "#b973ff",
  },
  {
    name: "Azure Lancer",
    texture: "voidline-boss-wave-40",
    accent: "#39d9ff",
  },
  {
    name: "Emerald Engine",
    texture: "voidline-boss-wave-50",
    accent: "#72ffb1",
  },
  {
    name: "White Singularity",
    texture: "voidline-boss-wave-60",
    accent: "#ffffff",
  },
] as const;

export function bossVariantForWave(wave: number): number {
  return Math.max(0, Math.floor(wave / 10) - 1);
}

export function bossVisualForVariant(variant: number): (typeof bossVisuals)[number] {
  return bossVisuals[variant % bossVisuals.length]!;
}
