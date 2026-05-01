import { balance, recomputeMultiplicativeStats } from "./balance";
import type { Player, PlayerBonus } from "../types";

export type PercentStat =
  | "fireRate"
  | "damage"
  | "bulletSpeed"
  | "speed"
  | "pickupRadius"
  | "bulletRadius";

export type CappedIntStat = "projectileCount" | "pierce" | "drones";

export type CappedPctStat = "critChance";

export type CapKey =
  | "projectiles"
  | "pierce"
  | "drones"
  | "critChance"
  | "fireRateMul"
  | "damageMul";

export type GainCurve = "stepped" | "droneStepped" | "fixed";

export type EffectScale = "tier.power" | number;

export interface AddPctEffect {
  type: "addPct";
  stat: PercentStat;
  amount: number;
  scale?: EffectScale;
}

export interface ScaleCurrentPctEffect {
  type: "scaleCurrentPct";
  stat: PercentStat;
  factor: number;
}

export interface AddCappedEffect {
  type: "addCapped";
  stat: CappedIntStat;
  amount: number;
  cap: CapKey;
  gainCurve?: GainCurve;
}

export interface AddCappedPctEffect {
  type: "addCappedPct";
  stat: CappedPctStat;
  amount: number;
  cap: CapKey;
  scale?: EffectScale;
}

export interface AddCappedPctBonusEffect {
  type: "addCappedPctBonus";
  stat: PercentStat;
  amount: number;
  cap: CapKey;
  scale?: EffectScale;
}

export interface ShieldGrantEffect {
  type: "shieldGrant";
  shield: number;
  regen: number;
  maxHpBonus?: number;
  healRatio?: number;
  scale?: EffectScale;
}

export interface AddLifestealEffect {
  type: "addLifesteal";
  amount: number;
}

export interface HealFlatEffect {
  type: "healFlat";
  amount: number;
  scale?: EffectScale;
}

export interface HealPctEffect {
  type: "healPct";
  amount: number;
}

export interface AddMaxHpEffect {
  type: "addMaxHp";
  amount: number;
  scale?: EffectScale;
}

export interface SetMinEffect {
  type: "setMin";
  stat: CappedIntStat;
  value: number;
}

export type EffectOp =
  | AddPctEffect
  | ScaleCurrentPctEffect
  | AddCappedEffect
  | AddCappedPctEffect
  | AddCappedPctBonusEffect
  | ShieldGrantEffect
  | AddLifestealEffect
  | HealFlatEffect
  | HealPctEffect
  | AddMaxHpEffect
  | SetMinEffect;

const PERCENT_BONUS_KEY: Record<PercentStat, keyof PlayerBonus> = {
  fireRate: "fireRatePct",
  damage: "damagePct",
  bulletSpeed: "bulletSpeedPct",
  speed: "speedPct",
  pickupRadius: "pickupRadiusPct",
  bulletRadius: "bulletRadiusPct",
};

function resolveScale(scale: EffectScale | undefined, tierPower: number): number {
  if (scale === undefined) return 1;
  if (scale === "tier.power") return tierPower;
  return scale;
}

function steppedAmount(amount: number, tierPower: number): number {
  const stepped = balance.upgrade.steppedGain;
  if (tierPower >= stepped.singularityThreshold) {
    return amount * stepped.singularity;
  }
  if (tierPower >= stepped.rareThreshold) {
    return amount * stepped.rare;
  }
  return amount * stepped.standard;
}

function droneSteppedAmount(amount: number, tierPower: number): number {
  return tierPower >= balance.upgrade.effects.droneExtraThreshold ? amount * 2 : amount;
}

function computeCappedGain(op: AddCappedEffect, tierPower: number): number {
  switch (op.gainCurve) {
    case "stepped":
      return steppedAmount(op.amount, tierPower);
    case "droneStepped":
      return droneSteppedAmount(op.amount, tierPower);
    case "fixed":
    case undefined:
      return op.amount;
  }
}

function applyEffectStep(op: EffectOp, tierPower: number, target: Player): void {
  switch (op.type) {
    case "addPct": {
      const scale = resolveScale(op.scale ?? "tier.power", tierPower);
      target.bonus[PERCENT_BONUS_KEY[op.stat]] += op.amount * scale;
      return;
    }
    case "scaleCurrentPct": {
      const bonusKey = PERCENT_BONUS_KEY[op.stat];
      target.bonus[bonusKey] = (1 + target.bonus[bonusKey]) * op.factor - 1;
      return;
    }
    case "addCapped": {
      const cap = balance.upgrade.caps[op.cap];
      const gain = computeCappedGain(op, tierPower);
      target[op.stat] = Math.min(cap, target[op.stat] + gain);
      return;
    }
    case "addCappedPct": {
      const cap = balance.upgrade.caps[op.cap];
      const scale = resolveScale(op.scale ?? "tier.power", tierPower);
      target[op.stat] = Math.min(cap, target[op.stat] + op.amount * scale);
      return;
    }
    case "addCappedPctBonus": {
      const cap = balance.upgrade.caps[op.cap];
      const scale = resolveScale(op.scale ?? "tier.power", tierPower);
      const bonusKey = PERCENT_BONUS_KEY[op.stat];
      target.bonus[bonusKey] = Math.min(cap, target.bonus[bonusKey] + op.amount * scale);
      return;
    }
    case "shieldGrant": {
      const scale = resolveScale(op.scale ?? "tier.power", tierPower);
      const shieldAmount = Math.round(op.shield * scale);
      const regenAmount = op.regen * scale;
      target.shieldMax += shieldAmount;
      target.shield = Math.min(target.shieldMax, target.shield + shieldAmount);
      target.shieldRegen += regenAmount;
      if (op.maxHpBonus !== undefined) {
        const maxHpAmount = Math.round(op.maxHpBonus * scale);
        target.maxHp += maxHpAmount;
        if (op.healRatio !== undefined) {
          target.hp = Math.min(
            target.maxHp,
            target.hp + Math.round(maxHpAmount * op.healRatio),
          );
        }
      }
      return;
    }
    case "addLifesteal": {
      target.lifesteal += op.amount;
      return;
    }
    case "healFlat": {
      const scale = resolveScale(op.scale, tierPower);
      target.hp = Math.min(target.maxHp, target.hp + op.amount * scale);
      return;
    }
    case "healPct": {
      target.hp = Math.min(target.maxHp, target.hp + target.maxHp * op.amount);
      return;
    }
    case "addMaxHp": {
      const scale = resolveScale(op.scale, tierPower);
      target.maxHp = Math.max(1, target.maxHp + op.amount * scale);
      target.hp = Math.min(target.hp, target.maxHp);
      return;
    }
    case "setMin": {
      target[op.stat] = Math.max(target[op.stat], op.value);
      return;
    }
  }
}

export function runEffects(
  effects: readonly EffectOp[],
  tierPower: number,
  target: Player,
): void {
  for (const effect of effects) {
    applyEffectStep(effect, tierPower, target);
  }
  recomputeMultiplicativeStats(target);
}

export function applyEffect(op: EffectOp, tierPower: number, target: Player): void {
  applyEffectStep(op, tierPower, target);
  recomputeMultiplicativeStats(target);
}
