//! Bit-exact port of `src/game/effect-dsl.ts` — interprets EffectOp
//! against a Player, with semantics identical to the TS interpreter.

use voidline_data::balance::Balance;
use voidline_data::dsl::{
    CapKey, CappedIntStat, CappedPctStat, EffectOp, EffectScale, EffectScaleTag, GainCurve,
    PercentStat,
};

use crate::player::Player;

fn resolve_scale(scale: Option<EffectScale>, tier_power: f64) -> f64 {
    match scale {
        None => 1.0,
        Some(EffectScale::Tag(EffectScaleTag::TierPower)) => tier_power,
        Some(EffectScale::Number(n)) => n,
    }
}

fn cap_value(balance: &Balance, key: CapKey) -> f64 {
    match key {
        CapKey::Drones => balance.upgrade.caps.drones,
        CapKey::Projectiles => balance.upgrade.caps.projectiles,
        CapKey::Pierce => balance.upgrade.caps.pierce,
        CapKey::CritChance => balance.upgrade.caps.crit_chance,
    }
}

fn stepped_amount(balance: &Balance, base_amount: f64, tier_power: f64) -> f64 {
    let s = &balance.upgrade.stepped_gain;
    if tier_power >= s.singularity_threshold {
        base_amount * s.singularity
    } else if tier_power >= s.rare_threshold {
        base_amount * s.rare
    } else {
        base_amount * s.standard
    }
}

fn drone_stepped_amount(balance: &Balance, base_amount: f64, tier_power: f64) -> f64 {
    if tier_power >= balance.upgrade.effects.drone_extra_threshold {
        base_amount * 2.0
    } else {
        base_amount
    }
}

fn capped_int_stat<'a>(player: &'a mut Player, stat: CappedIntStat) -> &'a mut f64 {
    match stat {
        CappedIntStat::ProjectileCount => &mut player.projectile_count,
        CappedIntStat::Pierce => &mut player.pierce,
        CappedIntStat::Drones => &mut player.drones,
    }
}

fn capped_pct_stat<'a>(player: &'a mut Player, stat: CappedPctStat) -> &'a mut f64 {
    match stat {
        CappedPctStat::CritChance => &mut player.crit_chance,
    }
}

fn percent_bonus<'a>(player: &'a mut Player, stat: PercentStat) -> &'a mut f64 {
    match stat {
        PercentStat::FireRate => &mut player.bonus.fire_rate_pct,
        PercentStat::Damage => &mut player.bonus.damage_pct,
        PercentStat::BulletSpeed => &mut player.bonus.bullet_speed_pct,
        PercentStat::Speed => &mut player.bonus.speed_pct,
        PercentStat::PickupRadius => &mut player.bonus.pickup_radius_pct,
        PercentStat::BulletRadius => &mut player.bonus.bullet_radius_pct,
    }
}

fn apply_step(op: &EffectOp, tier_power: f64, balance: &Balance, player: &mut Player) {
    match *op {
        EffectOp::AddPct { stat, amount, scale } => {
            let scale_value = resolve_scale(
                Some(scale.unwrap_or(EffectScale::Tag(EffectScaleTag::TierPower))),
                tier_power,
            );
            *percent_bonus(player, stat) += amount * scale_value;
        }
        EffectOp::AddCapped { stat, amount, cap, gain_curve } => {
            let cap_v = cap_value(balance, cap);
            let gain = match gain_curve {
                Some(GainCurve::Stepped) => stepped_amount(balance, amount, tier_power),
                Some(GainCurve::DroneStepped) => drone_stepped_amount(balance, amount, tier_power),
                Some(GainCurve::Fixed) | None => amount,
            };
            let target = capped_int_stat(player, stat);
            *target = (*target + gain).min(cap_v);
        }
        EffectOp::AddCappedPct { stat, amount, cap, scale } => {
            let cap_v = cap_value(balance, cap);
            let scale_value = resolve_scale(
                Some(scale.unwrap_or(EffectScale::Tag(EffectScaleTag::TierPower))),
                tier_power,
            );
            let target = capped_pct_stat(player, stat);
            *target = (*target + amount * scale_value).min(cap_v);
        }
        EffectOp::ShieldGrant { shield, regen, max_hp_bonus, heal_ratio, scale } => {
            let scale_value = resolve_scale(
                Some(scale.unwrap_or(EffectScale::Tag(EffectScaleTag::TierPower))),
                tier_power,
            );
            let shield_amount = (shield * scale_value).round();
            let regen_amount = regen * scale_value;
            player.shield_max += shield_amount;
            player.shield = player.shield_max.min(player.shield + shield_amount);
            player.shield_regen += regen_amount;
            if let Some(max_hp_bonus) = max_hp_bonus {
                let max_hp_amount = (max_hp_bonus * scale_value).round();
                player.max_hp += max_hp_amount;
                if let Some(heal_ratio) = heal_ratio {
                    let heal = (max_hp_amount * heal_ratio).round();
                    player.hp = player.max_hp.min(player.hp + heal);
                }
            }
        }
        EffectOp::AddLifesteal { amount } => {
            player.lifesteal += amount;
        }
        EffectOp::HealFlat { amount, scale } => {
            let scale_value = resolve_scale(scale, tier_power);
            player.hp = player.max_hp.min(player.hp + amount * scale_value);
        }
        EffectOp::HealPct { amount } => {
            player.hp = player.max_hp.min(player.hp + player.max_hp * amount);
        }
        EffectOp::AddMaxHp { amount, scale } => {
            let scale_value = resolve_scale(scale, tier_power);
            player.max_hp = (player.max_hp + amount * scale_value).max(1.0);
            player.hp = player.hp.min(player.max_hp);
        }
        EffectOp::SetMin { stat, value } => {
            let target = capped_int_stat(player, stat);
            *target = (*target).max(value);
        }
    }
}

pub fn run_effects(effects: &[EffectOp], tier_power: f64, balance: &Balance, player: &mut Player) {
    for effect in effects {
        apply_step(effect, tier_power, balance, player);
    }
    player.recompute_multiplicative_stats(balance);
}

#[cfg(test)]
mod tests {
    use super::*;
    use voidline_data::load_default;

    fn fresh_player(bundle: &voidline_data::DataBundle) -> Player {
        Player::new(&bundle.balance.player.stats)
    }

    fn find_upgrade<'a>(bundle: &'a voidline_data::DataBundle, id: &str) -> &'a voidline_data::Upgrade {
        bundle.upgrades.iter().find(|u| u.id == id).unwrap_or_else(|| panic!("upgrade {id} not found"))
    }

    fn find_relic<'a>(bundle: &'a voidline_data::DataBundle, id: &str) -> &'a voidline_data::Relic {
        bundle.relics.iter().find(|r| r.id == id).unwrap_or_else(|| panic!("relic {id} not found"))
    }

    fn find_tier<'a>(bundle: &'a voidline_data::DataBundle, id: &str) -> &'a voidline_data::UpgradeTier {
        bundle.balance.tiers.iter().find(|t| t.id == id).unwrap_or_else(|| panic!("tier {id}"))
    }

    #[test]
    fn twin_cannon_rare_increases_projectiles_to_three() {
        let bundle = load_default().unwrap();
        let mut player = fresh_player(&bundle);
        let upgrade = find_upgrade(&bundle, "twin-cannon");
        let tier = find_tier(&bundle, "rare");
        run_effects(&upgrade.effects, tier.power, &bundle.balance, &mut player);
        assert_eq!(player.projectile_count, 3.0);
    }

    #[test]
    fn plasma_core_standard_increases_fire_rate_by_22pct() {
        let bundle = load_default().unwrap();
        let mut player = fresh_player(&bundle);
        let upgrade = find_upgrade(&bundle, "plasma-core");
        let tier = find_tier(&bundle, "standard");
        run_effects(&upgrade.effects, tier.power, &bundle.balance, &mut player);
        assert!((player.fire_rate - 3.0 * 1.22).abs() < 1e-12);
    }

    #[test]
    fn rail_slug_standard_boosts_damage_and_bullet_speed() {
        let bundle = load_default().unwrap();
        let mut player = fresh_player(&bundle);
        let upgrade = find_upgrade(&bundle, "rail-slug");
        let tier = find_tier(&bundle, "standard");
        run_effects(&upgrade.effects, tier.power, &bundle.balance, &mut player);
        assert!((player.damage - 24.0 * 1.26).abs() < 1e-12);
        assert!((player.bullet_speed - 610.0 * 1.055).abs() < 1e-12);
    }

    #[test]
    fn kinetic_shield_standard_grants_24_shield_and_heals() {
        let bundle = load_default().unwrap();
        let mut player = fresh_player(&bundle);
        player.hp = 40.0;
        let upgrade = find_upgrade(&bundle, "kinetic-shield");
        let tier = find_tier(&bundle, "standard");
        run_effects(&upgrade.effects, tier.power, &bundle.balance, &mut player);
        assert_eq!(player.shield_max, 24.0);
        assert_eq!(player.shield, 24.0);
        assert!((player.shield_regen - 2.4).abs() < 1e-12);
        assert_eq!(player.max_hp, 120.0);
        assert_eq!(player.hp, 53.0);
    }

    #[test]
    fn crit_array_singularity_caps_at_balance_cap() {
        let bundle = load_default().unwrap();
        let mut player = fresh_player(&bundle);
        player.crit_chance = 0.94;
        let upgrade = find_upgrade(&bundle, "crit-array");
        let tier = find_tier(&bundle, "singularity");
        run_effects(&upgrade.effects, tier.power, &bundle.balance, &mut player);
        assert_eq!(player.crit_chance, bundle.balance.upgrade.caps.crit_chance);
    }

    #[test]
    fn salvage_plating_relic_adds_max_hp_and_heals_35() {
        let bundle = load_default().unwrap();
        let mut player = fresh_player(&bundle);
        let relic = find_relic(&bundle, "salvage-plating");
        run_effects(&relic.effects, 1.0, &bundle.balance, &mut player);
        assert_eq!(player.max_hp, 135.0);
        assert_eq!(player.hp, 135.0);
    }

    #[test]
    fn emergency_nanites_relic_adds_lifesteal_and_heals_40pct() {
        let bundle = load_default().unwrap();
        let mut player = fresh_player(&bundle);
        let relic = find_relic(&bundle, "emergency-nanites");
        run_effects(&relic.effects, 1.0, &bundle.balance, &mut player);
        assert_eq!(player.lifesteal, 1.0);
        assert!((player.hp - 100.0).abs() < 1e-12); // already at maxHp, healed but capped
    }

    #[test]
    fn additive_stacking_matches_ts() {
        let bundle = load_default().unwrap();
        let mut player = fresh_player(&bundle);
        let upgrade = find_upgrade(&bundle, "plasma-core");
        let tier = find_tier(&bundle, "standard");
        let effect = bundle.balance.upgrade.effects.fire_rate;
        for n in 1..=5 {
            run_effects(&upgrade.effects, tier.power, &bundle.balance, &mut player);
            let expected = bundle.balance.player.stats.fire_rate * (1.0 + (n as f64) * effect);
            assert!(
                (player.fire_rate - expected).abs() < 1e-12,
                "n={n}: got {}, expected {}",
                player.fire_rate,
                expected,
            );
        }
    }
}
