//! Mirror of `src/game/effect-dsl.ts`. Effects are deserialized with
//! tag-based discrimination on the `type` field.

use serde::Deserialize;

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase")]
pub enum PercentStat {
    FireRate,
    Damage,
    BulletSpeed,
    Speed,
    PickupRadius,
    BulletRadius,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase")]
pub enum CappedIntStat {
    ProjectileCount,
    Pierce,
    Drones,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase")]
pub enum CappedPctStat {
    CritChance,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase")]
pub enum CapKey {
    Projectiles,
    Pierce,
    Drones,
    CritChance,
    FireRateMul,
    DamageMul,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase")]
pub enum GainCurve {
    Stepped,
    DroneStepped,
    Fixed,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq)]
#[serde(untagged)]
pub enum EffectScale {
    Tag(EffectScaleTag),
    Number(f64),
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq, Hash)]
pub enum EffectScaleTag {
    #[serde(rename = "tier.power")]
    TierPower,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum EffectOp {
    #[serde(rename_all = "camelCase")]
    AddPct {
        stat: PercentStat,
        amount: f64,
        #[serde(default)]
        scale: Option<EffectScale>,
    },
    #[serde(rename_all = "camelCase")]
    AddCapped {
        stat: CappedIntStat,
        amount: f64,
        cap: CapKey,
        #[serde(default)]
        gain_curve: Option<GainCurve>,
    },
    #[serde(rename_all = "camelCase")]
    AddCappedPct {
        stat: CappedPctStat,
        amount: f64,
        cap: CapKey,
        #[serde(default)]
        scale: Option<EffectScale>,
    },
    #[serde(rename_all = "camelCase")]
    AddCappedPctBonus {
        stat: PercentStat,
        amount: f64,
        cap: CapKey,
        #[serde(default)]
        scale: Option<EffectScale>,
    },
    #[serde(rename_all = "camelCase")]
    ShieldGrant {
        shield: f64,
        regen: f64,
        #[serde(default)]
        max_hp_bonus: Option<f64>,
        #[serde(default)]
        heal_ratio: Option<f64>,
        #[serde(default)]
        scale: Option<EffectScale>,
    },
    #[serde(rename_all = "camelCase")]
    AddLifesteal { amount: f64 },
    #[serde(rename_all = "camelCase")]
    HealFlat {
        amount: f64,
        #[serde(default)]
        scale: Option<EffectScale>,
    },
    #[serde(rename_all = "camelCase")]
    HealPct { amount: f64 },
    #[serde(rename_all = "camelCase")]
    AddMaxHp {
        amount: f64,
        #[serde(default)]
        scale: Option<EffectScale>,
    },
    #[serde(rename_all = "camelCase")]
    SetMin { stat: CappedIntStat, value: f64 },
}
