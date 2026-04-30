//! Chest entity spawn + collection, mirroring `src/entities/chests.ts`.

use crate::entities::ChestEntity;
use crate::math::{circle_hit, CircleRef};
use crate::player::Player;
use crate::pools::{acquire_chest, release_chest, EntityPools};
use crate::rng::Mulberry32;
use crate::state::{EntityCounters, GameMode, GameState};

pub fn spawn_chest(
    pools: &mut EntityPools,
    counters: &mut EntityCounters,
    chests: &mut Vec<ChestEntity>,
    rng: &mut Mulberry32,
    x: f64,
    y: f64,
) {
    let angle = rng.next_f64() * std::f64::consts::TAU;
    let speed = 44.0 + rng.next_f64() * 36.0;
    let idx = acquire_chest(pools, counters, chests);
    let chest = &mut chests[idx];
    chest.x = x;
    chest.y = y;
    chest.vx = angle.cos() * speed;
    chest.vy = angle.sin() * speed;
    chest.radius = 20.0;
    chest.age = 0.0;
}

pub fn update_chests(
    pools: &mut EntityPools,
    state: &mut GameState,
    player: &Player,
    chests: &mut Vec<ChestEntity>,
    dt: f64,
) {
    let damp = 1.0 - dt * 1.8;
    let player_circle = CircleRef { x: player.x, y: player.y, radius: player.radius };
    let mut i = chests.len();
    while i > 0 {
        i -= 1;
        let chest_circle = {
            let chest = &mut chests[i];
            chest.age += dt;
            chest.x += chest.vx * dt;
            chest.y += chest.vy * dt;
            chest.vx *= damp;
            chest.vy *= damp;
            CircleRef { x: chest.x, y: chest.y, radius: chest.radius }
        };
        if !circle_hit(chest_circle, player_circle) {
            continue;
        }
        release_chest(pools, chests, i);
        if state.mode == GameMode::Playing {
            state.pending_chests += 1;
        }
    }
}
