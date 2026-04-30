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
        CapKey::FireRateMul => balance.upgrade.caps.fire_rate_mul,
        CapKey::DamageMul => balance.upgrade.caps.damage_mul,
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
        EffectOp::AddPct {
            stat,
            amount,
            scale,
        } => {
            let scale_value = resolve_scale(
                Some(scale.unwrap_or(EffectScale::Tag(EffectScaleTag::TierPower))),
                tier_power,
            );
            *percent_bonus(player, stat) += amount * scale_value;
        }
        EffectOp::AddCapped {
            stat,
            amount,
            cap,
            gain_curve,
        } => {
            let cap_v = cap_value(balance, cap);
            let gain = match gain_curve {
                Some(GainCurve::Stepped) => stepped_amount(balance, amount, tier_power),
                Some(GainCurve::DroneStepped) => drone_stepped_amount(balance, amount, tier_power),
                Some(GainCurve::Fixed) | None => amount,
            };
            let target = capped_int_stat(player, stat);
            *target = (*target + gain).min(cap_v);
        }
        EffectOp::AddCappedPct {
            stat,
            amount,
            cap,
            scale,
        } => {
            let cap_v = cap_value(balance, cap);
            let scale_value = resolve_scale(
                Some(scale.unwrap_or(EffectScale::Tag(EffectScaleTag::TierPower))),
                tier_power,
            );
            let target = capped_pct_stat(player, stat);
            *target = (*target + amount * scale_value).min(cap_v);
        }
        EffectOp::AddCappedPctBonus {
            stat,
            amount,
            cap,
            scale,
        } => {
            let cap_v = cap_value(balance, cap);
            let scale_value = resolve_scale(
                Some(scale.unwrap_or(EffectScale::Tag(EffectScaleTag::TierPower))),
                tier_power,
            );
            let target = percent_bonus(player, stat);
            *target = (*target + amount * scale_value).min(cap_v);
        }
        EffectOp::ShieldGrant {
            shield,
            regen,
            max_hp_bonus,
            heal_ratio,
            scale,
        } => {
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

    fn find_upgrade<'a>(
        bundle: &'a voidline_data::DataBundle,
        id: &str,
    ) -> &'a voidline_data::Upgrade {
        bundle
            .upgrades
            .iter()
            .find(|u| u.id == id)
            .unwrap_or_else(|| panic!("upgrade {id} not found"))
    }

    fn find_relic<'a>(bundle: &'a voidline_data::DataBundle, id: &str) -> &'a voidline_data::Relic {
        bundle
            .relics
            .iter()
            .find(|r| r.id == id)
            .unwrap_or_else(|| panic!("relic {id} not found"))
    }

    fn find_tier<'a>(
        bundle: &'a voidline_data::DataBundle,
        id: &str,
    ) -> &'a voidline_data::UpgradeTier {
        bundle
            .balance
            .tiers
            .iter()
            .find(|t| t.id == id)
            .unwrap_or_else(|| panic!("tier {id}"))
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
    fn plasma_core_standard_increases_fire_rate_by_15pct() {
        let bundle = load_default().unwrap();
        let mut player = fresh_player(&bundle);
        let upgrade = find_upgrade(&bundle, "plasma-core");
        let tier = find_tier(&bundle, "standard");
        run_effects(&upgrade.effects, tier.power, &bundle.balance, &mut player);
        let effect = bundle.balance.upgrade.effects.fire_rate;
        assert!((player.fire_rate - 3.0 * (1.0 + effect)).abs() < 1e-12);
    }

    #[test]
    fn rail_slug_standard_boosts_damage_and_bullet_speed() {
        let bundle = load_default().unwrap();
        let mut player = fresh_player(&bundle);
        let upgrade = find_upgrade(&bundle, "rail-slug");
        let tier = find_tier(&bundle, "standard");
        run_effects(&upgrade.effects, tier.power, &bundle.balance, &mut player);
        let dmg = bundle.balance.upgrade.effects.damage;
        let bs = bundle.balance.upgrade.effects.bullet_speed;
        assert!((player.damage - 24.0 * (1.0 + dmg)).abs() < 1e-12);
        assert!((player.bullet_speed - 610.0 * (1.0 + bs)).abs() < 1e-12);
    }

    #[test]
    fn kinetic_shield_standard_grants_shield_and_heals() {
        let bundle = load_default().unwrap();
        let mut player = fresh_player(&bundle);
        player.hp = 40.0;
        let upgrade = find_upgrade(&bundle, "kinetic-shield");
        let tier = find_tier(&bundle, "standard");
        run_effects(&upgrade.effects, tier.power, &bundle.balance, &mut player);
        let shield = bundle.balance.upgrade.effects.shield;
        let regen = bundle.balance.upgrade.effects.shield_regen;
        let max_hp_bonus = bundle.balance.upgrade.effects.max_hp;
        assert_eq!(player.shield_max, shield);
        assert_eq!(player.shield, shield);
        assert!((player.shield_regen - regen).abs() < 1e-12);
        assert_eq!(player.max_hp, 100.0 + max_hp_bonus);
        let expected_heal = (max_hp_bonus * 0.65).round();
        assert_eq!(player.hp, 40.0 + expected_heal);
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
        let baseline = bundle.balance.player.stats.fire_rate;
        // Stack 5×; final value must respect the fire_rate_mul cap, but each step matches additive.
        let cap = bundle.balance.upgrade.caps.fire_rate_mul;
        for n in 1..=5 {
            run_effects(&upgrade.effects, tier.power, &bundle.balance, &mut player);
            let raw_bonus = (n as f64) * effect;
            let capped_bonus = raw_bonus.min(cap);
            let expected = baseline * (1.0 + capped_bonus);
            assert!(
                (player.fire_rate - expected).abs() < 1e-12,
                "n={n}: got {}, expected {}",
                player.fire_rate,
                expected,
            );
        }
    }

    #[test]
    fn plasma_core_caps_at_fire_rate_mul() {
        let bundle = load_default().unwrap();
        let mut player = fresh_player(&bundle);
        let upgrade = find_upgrade(&bundle, "plasma-core");
        let tier = find_tier(&bundle, "singularity");
        let cap = bundle.balance.upgrade.caps.fire_rate_mul;
        // Apply many singularities; bonus must clamp.
        for _ in 0..40 {
            run_effects(&upgrade.effects, tier.power, &bundle.balance, &mut player);
        }
        assert!(
            (player.bonus.fire_rate_pct - cap).abs() < 1e-9,
            "fire_rate_pct must clamp to cap (got {}, cap {})",
            player.bonus.fire_rate_pct,
            cap,
        );
        let baseline = bundle.balance.player.stats.fire_rate;
        assert!((player.fire_rate - baseline * (1.0 + cap)).abs() < 1e-9);
    }

    #[test]
    fn rail_slug_caps_damage_at_damage_mul() {
        let bundle = load_default().unwrap();
        let mut player = fresh_player(&bundle);
        let upgrade = find_upgrade(&bundle, "rail-slug");
        let tier = find_tier(&bundle, "singularity");
        let cap = bundle.balance.upgrade.caps.damage_mul;
        for _ in 0..40 {
            run_effects(&upgrade.effects, tier.power, &bundle.balance, &mut player);
        }
        assert!(
            (player.bonus.damage_pct - cap).abs() < 1e-9,
            "damage_pct must clamp to cap (got {}, cap {})",
            player.bonus.damage_pct,
            cap,
        );
        // bullet_speed leg uses uncapped addPct, so it should keep accumulating.
        assert!(player.bonus.bullet_speed_pct > cap);
    }

    #[test]
    fn fire_rate_cap_holds_across_mixed_tiers() {
        let bundle = load_default().unwrap();
        let mut player = fresh_player(&bundle);
        let upgrade = find_upgrade(&bundle, "plasma-core");
        let cap = bundle.balance.upgrade.caps.fire_rate_mul;
        for tier_id in ["standard", "rare", "prototype", "singularity"] {
            let tier = find_tier(&bundle, tier_id);
            for _ in 0..15 {
                run_effects(&upgrade.effects, tier.power, &bundle.balance, &mut player);
            }
        }
        assert!(player.bonus.fire_rate_pct <= cap + 1e-9);
        assert!((player.bonus.fire_rate_pct - cap).abs() < 1e-9);
    }

    #[test]
    fn projectile_count_caps_at_balance_cap() {
        let bundle = load_default().unwrap();
        let mut player = fresh_player(&bundle);
        let upgrade = find_upgrade(&bundle, "twin-cannon");
        let tier = find_tier(&bundle, "singularity");
        for _ in 0..15 {
            run_effects(&upgrade.effects, tier.power, &bundle.balance, &mut player);
        }
        assert_eq!(
            player.projectile_count,
            bundle.balance.upgrade.caps.projectiles
        );
    }

    #[test]
    fn pierce_caps_at_balance_cap() {
        let bundle = load_default().unwrap();
        let mut player = fresh_player(&bundle);
        let upgrade = find_upgrade(&bundle, "lance-capacitor");
        let tier = find_tier(&bundle, "singularity");
        for _ in 0..15 {
            run_effects(&upgrade.effects, tier.power, &bundle.balance, &mut player);
        }
        assert_eq!(player.pierce, bundle.balance.upgrade.caps.pierce);
    }

    #[test]
    fn drones_cap_at_balance_cap() {
        let bundle = load_default().unwrap();
        let mut player = fresh_player(&bundle);
        let upgrade = find_upgrade(&bundle, "drone-uplink");
        let tier = find_tier(&bundle, "singularity");
        for _ in 0..15 {
            run_effects(&upgrade.effects, tier.power, &bundle.balance, &mut player);
        }
        assert_eq!(player.drones, bundle.balance.upgrade.caps.drones);
    }

    #[test]
    fn singularity_projectile_gains_3_per_pick() {
        let bundle = load_default().unwrap();
        let mut player = fresh_player(&bundle);
        let upgrade = find_upgrade(&bundle, "twin-cannon");
        let tier = find_tier(&bundle, "singularity");
        run_effects(&upgrade.effects, tier.power, &bundle.balance, &mut player);
        // Stepped gain at singularity = 3 per pick from balance.json.
        let stepped_sing = bundle.balance.upgrade.stepped_gain.singularity;
        assert_eq!(player.projectile_count, 1.0 + stepped_sing);
    }

    #[test]
    fn rare_projectile_gain_matches_stepped_rare() {
        let bundle = load_default().unwrap();
        let mut player = fresh_player(&bundle);
        let upgrade = find_upgrade(&bundle, "twin-cannon");
        let tier = find_tier(&bundle, "rare");
        run_effects(&upgrade.effects, tier.power, &bundle.balance, &mut player);
        let stepped_rare = bundle.balance.upgrade.stepped_gain.rare;
        assert_eq!(player.projectile_count, 1.0 + stepped_rare);
    }

    #[test]
    fn drone_extra_threshold_grants_two_drones_for_prototype() {
        let bundle = load_default().unwrap();
        let mut player = fresh_player(&bundle);
        let upgrade = find_upgrade(&bundle, "drone-uplink");
        let tier = find_tier(&bundle, "prototype");
        run_effects(&upgrade.effects, tier.power, &bundle.balance, &mut player);
        // prototype.power should pass drone_extra_threshold → +2 drones.
        assert_eq!(player.drones, 2.0);
    }

    #[test]
    fn drone_extra_threshold_grants_only_one_for_rare() {
        let bundle = load_default().unwrap();
        let mut player = fresh_player(&bundle);
        let upgrade = find_upgrade(&bundle, "drone-uplink");
        let tier = find_tier(&bundle, "rare");
        run_effects(&upgrade.effects, tier.power, &bundle.balance, &mut player);
        assert_eq!(player.drones, 1.0);
    }

    #[test]
    fn crit_array_does_not_overshoot_cap() {
        let bundle = load_default().unwrap();
        let mut player = fresh_player(&bundle);
        let upgrade = find_upgrade(&bundle, "crit-array");
        let tier = find_tier(&bundle, "singularity");
        for _ in 0..30 {
            run_effects(&upgrade.effects, tier.power, &bundle.balance, &mut player);
        }
        assert!(player.crit_chance <= bundle.balance.upgrade.caps.crit_chance + 1e-12);
        assert_eq!(player.crit_chance, bundle.balance.upgrade.caps.crit_chance);
    }

    #[test]
    fn ion_engine_speed_compounds_via_addpct() {
        let bundle = load_default().unwrap();
        let mut player = fresh_player(&bundle);
        let upgrade = find_upgrade(&bundle, "ion-engine");
        let tier = find_tier(&bundle, "standard");
        let effect = bundle.balance.upgrade.effects.speed;
        for _ in 0..3 {
            run_effects(&upgrade.effects, tier.power, &bundle.balance, &mut player);
        }
        assert!((player.bonus.speed_pct - 3.0 * effect).abs() < 1e-12);
    }

    #[test]
    fn tier_power_scales_addpct_effects() {
        let bundle = load_default().unwrap();
        let upgrade = find_upgrade(&bundle, "ion-engine");
        let standard = find_tier(&bundle, "standard");
        let prototype = find_tier(&bundle, "prototype");

        let mut p1 = fresh_player(&bundle);
        run_effects(&upgrade.effects, standard.power, &bundle.balance, &mut p1);
        let mut p2 = fresh_player(&bundle);
        run_effects(&upgrade.effects, prototype.power, &bundle.balance, &mut p2);
        let ratio = p2.bonus.speed_pct / p1.bonus.speed_pct;
        assert!((ratio - prototype.power / standard.power).abs() < 1e-12);
    }

    #[test]
    fn shield_grant_scales_with_tier_power() {
        let bundle = load_default().unwrap();
        let upgrade = find_upgrade(&bundle, "kinetic-shield");
        let standard = find_tier(&bundle, "standard");
        let singularity = find_tier(&bundle, "singularity");

        let mut p1 = fresh_player(&bundle);
        run_effects(&upgrade.effects, standard.power, &bundle.balance, &mut p1);
        let mut p2 = fresh_player(&bundle);
        run_effects(
            &upgrade.effects,
            singularity.power,
            &bundle.balance,
            &mut p2,
        );
        // Shield must scale roughly with the singularity power multiplier.
        assert!(p2.shield > p1.shield);
        assert_eq!(
            p1.shield,
            (bundle.balance.upgrade.effects.shield * standard.power).round(),
        );
        assert_eq!(
            p2.shield,
            (bundle.balance.upgrade.effects.shield * singularity.power).round(),
        );
    }

    #[test]
    fn magnet_array_scales_pickup_radius_with_tier() {
        let bundle = load_default().unwrap();
        let upgrade = find_upgrade(&bundle, "magnet-array");
        let mut player = fresh_player(&bundle);
        let tier = find_tier(&bundle, "rare");
        run_effects(&upgrade.effects, tier.power, &bundle.balance, &mut player);
        let pickup = bundle.balance.upgrade.effects.pickup_radius;
        assert!((player.bonus.pickup_radius_pct - pickup * tier.power).abs() < 1e-12);
    }

    #[test]
    fn run_effects_calls_recompute_for_multiplicative_stats() {
        // Sanity: after addPct on damage, target.damage must reflect the bonus, not just bonus_pct.
        let bundle = load_default().unwrap();
        let mut player = fresh_player(&bundle);
        let upgrade = find_upgrade(&bundle, "rail-slug");
        let tier = find_tier(&bundle, "rare");
        run_effects(&upgrade.effects, tier.power, &bundle.balance, &mut player);
        let dmg_effect = bundle.balance.upgrade.effects.damage;
        let baseline = bundle.balance.player.stats.damage;
        assert!((player.damage - baseline * (1.0 + dmg_effect * tier.power)).abs() < 1e-12);
    }

    #[test]
    fn fresh_player_has_no_bonuses() {
        let bundle = load_default().unwrap();
        let player = fresh_player(&bundle);
        assert_eq!(player.bonus.fire_rate_pct, 0.0);
        assert_eq!(player.bonus.damage_pct, 0.0);
        assert_eq!(player.bonus.speed_pct, 0.0);
        assert_eq!(player.bonus.pickup_radius_pct, 0.0);
        assert_eq!(player.bonus.bullet_speed_pct, 0.0);
        assert_eq!(player.bonus.bullet_radius_pct, 0.0);
        assert_eq!(player.shield, 0.0);
        assert_eq!(player.shield_max, 0.0);
        assert_eq!(player.shield_regen, 0.0);
        assert_eq!(player.lifesteal, 0.0);
    }
}
