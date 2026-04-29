export const bossVisuals = [
  {
    name: "Crimson Needle",
    texture: "voidline-boss-wave-10",
    path: "/assets/sprites/boss-wave-10.png",
    accent: "#ff5a69",
  },
  {
    name: "Gilded Maw",
    texture: "voidline-boss-wave-20",
    path: "/assets/sprites/boss-wave-20.png",
    accent: "#ffbf47",
  },
  {
    name: "Violet Bastion",
    texture: "voidline-boss-wave-30",
    path: "/assets/sprites/boss-wave-30.png",
    accent: "#b973ff",
  },
  {
    name: "Azure Lancer",
    texture: "voidline-boss-wave-40",
    path: "/assets/sprites/boss-wave-40.png",
    accent: "#39d9ff",
  },
  {
    name: "Emerald Engine",
    texture: "voidline-boss-wave-50",
    path: "/assets/sprites/boss-wave-50.png",
    accent: "#72ffb1",
  },
  {
    name: "White Singularity",
    texture: "voidline-boss-wave-60",
    path: "/assets/sprites/boss-wave-60.png",
    accent: "#ffffff",
  },
] as const;

export function bossVariantForWave(wave: number): number {
  return Math.max(0, Math.floor(wave / 10) - 1);
}

export function bossVisualForVariant(variant: number): (typeof bossVisuals)[number] {
  return bossVisuals[variant % bossVisuals.length]!;
}
