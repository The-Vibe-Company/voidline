//! Experience orb spawning + collection owned by the Rust runtime engine.

use voidline_data::balance::Balance;

use crate::balance_curves::{experience_drop_total, experience_orb_radius, experience_shard_count};
use crate::entities::{Enemy, ExperienceOrb};
use crate::player::Player;
use crate::pools::{acquire_experience_orb, release_experience_orb, EntityPools};
use crate::progression::collect_experience;
use crate::rng::Mulberry32;
use crate::state::{EntityCounters, GameState};

const MAGNETIZED_PULL: f64 = 560.0;
const MAGNETIZED_CONTACT_PADDING: f64 = 8.0;

pub fn spawn_experience(
    balance: &Balance,
    pools: &mut EntityPools,
    counters: &mut EntityCounters,
    orbs: &mut Vec<ExperienceOrb>,
    rng: &mut Mulberry32,
    enemy: &Enemy,
    pressure: u32,
) {
    let total = experience_drop_total(balance, enemy.score, pressure);
    let shard_count = experience_shard_count(balance, enemy.kind.as_str());
    let mut remaining = total;

    for i in 0..shard_count {
        let value = if i == shard_count - 1 {
            remaining
        } else {
            ((total as f64) / (shard_count as f64)).round().max(1.0) as i64
        };
        remaining -= value;
        let angle = rng.next_f64() * std::f64::consts::TAU;
        let speed = 70.0 + rng.next_f64() * 120.0;
        let radius = experience_orb_radius(balance, value as f64);
        let age = rng.next_f64() * 0.4;
        let idx = acquire_experience_orb(pools, counters, orbs);
        let orb = &mut orbs[idx];
        orb.x = enemy.x;
        orb.y = enemy.y;
        orb.vx = angle.cos() * speed;
        orb.vy = angle.sin() * speed;
        orb.radius = radius;
        orb.value = value as f64;
        orb.age = age;
        orb.magnetized = false;
    }
}

pub fn pickup_radius_for(balance: &Balance, player: &Player) -> f64 {
    balance.xp.pickup_base_radius * player.pickup_radius
}

pub fn should_collect_orb(
    orb: &mut ExperienceOrb,
    player: &Player,
    pickup_radius: f64,
    dt: f64,
) -> bool {
    let dx = player.x - orb.x;
    let dy = player.y - orb.y;
    let dist_sq = dx * dx + dy * dy;
    if orb.magnetized {
        let distance = dist_sq.sqrt();
        let inv = 1.0 / distance.max(1.0);
        orb.vx += dx * inv * MAGNETIZED_PULL * dt;
        orb.vy += dy * inv * MAGNETIZED_PULL * dt;
        let contact = player.radius + orb.radius + MAGNETIZED_CONTACT_PADDING;
        return dist_sq < contact * contact;
    }
    dist_sq < pickup_radius * pickup_radius
}

pub fn update_experience(
    balance: &Balance,
    pools: &mut EntityPools,
    state: &mut GameState,
    player: &mut Player,
    orbs: &mut Vec<ExperienceOrb>,
    dt: f64,
) {
    let damp = 1.0 - dt * 2.7;
    for orb in orbs.iter_mut() {
        orb.age += dt;
        orb.x += orb.vx * dt;
        orb.y += orb.vy * dt;
        orb.vx *= damp;
        orb.vy *= damp;
    }

    let pickup_radius = pickup_radius_for(balance, player);
    let mut i = orbs.len();
    while i > 0 {
        i -= 1;
        let collect = should_collect_orb(&mut orbs[i], player, pickup_radius, dt);
        if collect {
            let value = orbs[i].value as u32;
            collect_experience(balance, state, player, value);
            release_experience_orb(pools, orbs, i);
        }
    }
}
