//! Powerup orb spawning, update, and effects.
//! Mirrors `src/entities/powerups.ts`.

use voidline_data::balance::Balance;

use crate::entities::{Enemy, ExperienceOrb, PowerupKind, PowerupOrb};
use crate::player::Player;
use crate::pools::{acquire_powerup_orb, release_powerup_orb, EntityPools};
use crate::rng::Mulberry32;
use crate::state::GameState;

#[derive(Debug, Clone, Copy)]
pub struct PowerupVariant {
    pub kind: PowerupKind,
    pub rarity: f64,
}

pub const POWERUP_VARIANTS: [PowerupVariant; 3] = [
    PowerupVariant { kind: PowerupKind::Heart, rarity: 4.0 },
    PowerupVariant { kind: PowerupKind::Magnet, rarity: 4.0 },
    PowerupVariant { kind: PowerupKind::Bomb, rarity: 3.0 },
];

fn pick_variant(rng: &mut Mulberry32) -> PowerupKind {
    let total: f64 = POWERUP_VARIANTS.iter().map(|v| v.rarity).sum();
    let mut roll = rng.next_f64() * total;
    for v in POWERUP_VARIANTS.iter() {
        roll -= v.rarity;
        if roll <= 0.0 {
            return v.kind;
        }
    }
    POWERUP_VARIANTS[0].kind
}

pub fn maybe_drop_powerup(
    balance: &Balance,
    pools: &mut EntityPools,
    counters: &mut crate::state::EntityCounters,
    orbs: &mut Vec<PowerupOrb>,
    rng: &mut Mulberry32,
    enemy: &Enemy,
    suppressed: bool,
) {
    if suppressed {
        return;
    }
    let chance = *balance
        .powerups
        .drop_chance
        .get(enemy.kind.as_str())
        .unwrap_or(&0.0);
    if rng.next_f64() > chance {
        return;
    }
    let kind = pick_variant(rng);
    let angle = rng.next_f64() * std::f64::consts::TAU;
    let speed = 80.0 + rng.next_f64() * 80.0;
    let idx = acquire_powerup_orb(pools, counters, orbs, kind);
    let orb = &mut orbs[idx];
    orb.x = enemy.x;
    orb.y = enemy.y;
    orb.vx = angle.cos() * speed;
    orb.vy = angle.sin() * speed;
    orb.radius = 13.0;
    orb.age = 0.0;
    orb.life = 16.0;
}

pub enum BombSideEffect {
    None,
    KillAllEnemies,
}

pub fn apply_powerup(
    balance: &Balance,
    state: &mut GameState,
    player: &mut Player,
    experience_orbs: &mut Vec<ExperienceOrb>,
    kind: PowerupKind,
) -> BombSideEffect {
    match kind {
        PowerupKind::Heart => {
            let heal = player.max_hp * balance.powerups.heart_heal_ratio;
            player.hp = player.max_hp.min(player.hp + heal);
            state.hearts_carried += 1;
            BombSideEffect::None
        }
        PowerupKind::Magnet => {
            for orb in experience_orbs.iter_mut() {
                orb.magnetized = true;
            }
            state.magnets_carried += 1;
            BombSideEffect::None
        }
        PowerupKind::Bomb => {
            state.bombs_carried += 1;
            BombSideEffect::KillAllEnemies
        }
    }
}

pub fn update_powerups(
    balance: &Balance,
    pools: &mut EntityPools,
    state: &mut GameState,
    player: &mut Player,
    experience_orbs: &mut Vec<ExperienceOrb>,
    orbs: &mut Vec<PowerupOrb>,
    dt: f64,
) -> Vec<BombSideEffect> {
    let pull_radius = balance.powerups.pull_radius;
    let pull_radius_sq = pull_radius * pull_radius;
    let damp = 1.0 - dt * balance.powerups.velocity_damping;
    let mut side_effects = Vec::new();

    let mut i = orbs.len();
    while i > 0 {
        i -= 1;
        let kind: PowerupKind;
        let pickup: bool;
        let life_expired: bool;
        {
            let orb = &mut orbs[i];
            orb.age += dt;
            orb.life -= dt;
            orb.x += orb.vx * dt;
            orb.y += orb.vy * dt;
            orb.vx *= damp;
            orb.vy *= damp;

            let dx = player.x - orb.x;
            let dy = player.y - orb.y;
            let dist_sq = dx * dx + dy * dy;
            let pickup_radius = player.radius + orb.radius + 6.0;
            pickup = dist_sq < pickup_radius * pickup_radius;
            kind = orb.kind;
            life_expired = orb.life <= 0.0;

            if !pickup && dist_sq < pull_radius_sq {
                let distance = dist_sq.sqrt();
                let pull = (1.0 - distance / pull_radius) * balance.powerups.pull_strength;
                let inv = 1.0 / distance.max(1.0);
                orb.vx += dx * inv * pull * dt;
                orb.vy += dy * inv * pull * dt;
            }
        }

        if pickup {
            let effect = apply_powerup(balance, state, player, experience_orbs, kind);
            side_effects.push(effect);
            release_powerup_orb(pools, orbs, i);
        } else if life_expired {
            release_powerup_orb(pools, orbs, i);
        }
    }
    side_effects
}
