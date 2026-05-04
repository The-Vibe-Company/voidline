use crate::snapshot::{ShopOffer, ShopState, Snapshot};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ShopAction {
    Buy(usize),
    Reroll,
    NextWave,
}

pub fn choose_shop_action(snapshot: &Snapshot, shop: &ShopState) -> ShopAction {
    if let Some((idx, _)) = ranked_affordable(snapshot, &shop.offers, shop.currency).first() {
        return ShopAction::Buy(*idx);
    }
    // Reroll more aggressively when we're flush; less so when poor.
    let reroll_budget = if snapshot.wave <= 3 {
        shop.currency / 3
    } else {
        shop.currency * 2 / 3
    };
    if shop.reroll_cost <= reroll_budget && shop.currency >= shop.reroll_cost + 20 {
        return ShopAction::Reroll;
    }
    ShopAction::NextWave
}

fn ranked_affordable(
    snapshot: &Snapshot,
    offers: &[ShopOffer],
    currency: i64,
) -> Vec<(usize, i32)> {
    let mut ranked: Vec<_> = offers
        .iter()
        .enumerate()
        .filter(|(_, offer)| offer.cost <= currency)
        .map(|(idx, offer)| (idx, priority(snapshot, &offer.id)))
        .filter(|(_, priority)| *priority > 0)
        .collect();
    ranked.sort_by(|a, b| b.1.cmp(&a.1));
    ranked
}

fn priority(snapshot: &Snapshot, id: &str) -> i32 {
    let wave = snapshot.wave;
    let projectiles = snapshot.player.projectile_count;
    let weapon_count = snapshot.weapons.len();
    let max_tier = snapshot.weapons.iter().map(|w| w.tier).max().unwrap_or(0);

    if let Some(rest) = id.strip_prefix("weapon:acquire:") {
        let tier = parse_weapon_tier(rest);
        // Want 3-4 weapons. Past that, acquiring fragments DPS — strongly deprioritize.
        let base = match weapon_count {
            0 => 140,
            1 => 130,
            2 => 115,
            3 => 90,
            _ => 30,
        };
        return base + 5 * tier;
    }
    if let Some(rest) = id.strip_prefix("weapon:promote:") {
        let tier = parse_weapon_tier(rest);
        // Promotions become very valuable once we have 3+ weapons.
        let base = if weapon_count >= 3 { 135 } else { 95 };
        return base + 8 * tier;
    }

    match (wave, id) {
        // Early-wave survivability bias — bench dies a lot at W2-W4 from
        // contact damage. Max-hp and speed are real lifesavers.
        (1..=2, "max-hp-up") => 110,
        (1..=2, "speed-up") => 100,
        (1..=2, "damage-up") => 95,
        (1..=2, "fire-rate-up") => 90,
        (3..=4, "max-hp-up") => 105,
        (3..=4, "damage-up") => 100,
        (3..=4, "speed-up") => 90,
        (3..=4, "fire-rate-up") => 88,
        (4..=5, "projectile-up") if projectiles < 3.0 && snapshot.currency >= 90 => 115,
        (4..=5, "pierce-up") if snapshot.currency >= 60 => 95,
        (5..=6, "max-hp-up") if max_tier >= 2 => 100,
        (_, "damage-up") if wave >= 6 => 115,
        (_, "crit-up") if wave >= 6 => 100,
        (_, "bullet-radius-up") if wave >= 6 && projectiles >= 2.0 => 90,
        (_, "fire-rate-up") => 80,
        (_, "max-hp-up") => 70,
        (_, "range-up") => 65,
        (_, "speed-up") => 60,
        (_, "bullet-speed-up") => 35,
        _ => 0,
    }
}

fn parse_weapon_tier(rest: &str) -> i32 {
    rest.rsplit(":t")
        .next()
        .and_then(|t| t.parse::<i32>().ok())
        .unwrap_or(1)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::snapshot::{PlayerSnapshot, Snapshot, WeaponSnapshot};

    fn snapshot(wave: u32, weapons: Vec<(&str, u32)>, currency: i64) -> Snapshot {
        Snapshot {
            schema_version: 1,
            mode: "shop".into(),
            wave,
            wave_timer: 0.0,
            run_elapsed: 0.0,
            score: 0,
            currency,
            hp: 100.0,
            max_hp: 100.0,
            player: PlayerSnapshot {
                x: 0.0,
                y: 0.0,
                speed: 145.0,
                damage: 24.0,
                fire_rate: 1.6,
                range: 240.0,
                projectile_count: 1.0,
                pierce: 0.0,
                crit_chance: 0.0,
            },
            enemies: vec![],
            orbs: vec![],
            enemy_bullets: vec![],
            attack_telegraphs: vec![],
            spawn_indicators: vec![],
            weapons: weapons
                .into_iter()
                .map(|(d, t)| WeaponSnapshot {
                    def_id: d.into(),
                    tier: t,
                })
                .collect(),
        }
    }

    #[test]
    fn promotes_existing_weapons_when_loadout_full() {
        let snap = snapshot(
            6,
            vec![("pulse", 1), ("ripper", 1), ("blaster", 1), ("scythe", 1)],
            500,
        );
        let acquire = priority(&snap, "weapon:acquire:pulse:t1");
        let promote = priority(&snap, "weapon:promote:pulse:t2");
        assert!(
            promote > acquire,
            "promote should outrank acquire with 4 weapons (got promote={promote} acquire={acquire})"
        );
    }

    #[test]
    fn early_game_favors_max_hp_over_damage() {
        let snap = snapshot(1, vec![("pulse", 1)], 100);
        let max_hp = priority(&snap, "max-hp-up");
        let damage = priority(&snap, "damage-up");
        assert!(
            max_hp > damage,
            "max-hp should outrank damage at wave 1 (got max_hp={max_hp} damage={damage})"
        );
    }

    #[test]
    fn first_acquire_outranks_stat_upgrade() {
        let snap = snapshot(1, vec![("pulse", 1)], 100);
        let acquire = priority(&snap, "weapon:acquire:ripper:t1");
        let max_hp = priority(&snap, "max-hp-up");
        assert!(
            acquire > max_hp,
            "acquiring 2nd weapon should outrank stat (got acquire={acquire} max_hp={max_hp})"
        );
    }
}
