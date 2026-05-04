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
    if shop.reroll_cost <= shop.currency / 2 {
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
    match (wave, id) {
        (1..=3, "damage-up") => 100,
        (1..=3, "fire-rate-up") => 90,
        (1..=3, "speed-up") => 80,
        (1..=3, "max-hp-up") => 70,
        (4..=5, "projectile-up") if projectiles < 3.0 && snapshot.currency >= 90 => 120,
        (4..=5, "pierce-up") if snapshot.currency >= 60 => 100,
        (_, "damage-up") if wave >= 6 => 120,
        (_, "crit-up") if wave >= 6 => 105,
        (_, "bullet-radius-up") if wave >= 6 && projectiles >= 2.0 => 95,
        (_, "fire-rate-up") => 85,
        (_, "range-up") => 65,
        (_, "speed-up") => 60,
        (_, "max-hp-up") => 55,
        (_, "bullet-speed-up") => 35,
        _ => 0,
    }
}
