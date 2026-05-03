//! Champion movement policy for balance reports.
//!
//! Combines a Velocity-Obstacle / time-to-collision threat field, a utility
//! field for XP orbs and powerups, a priority-target attractor for DPS routing,
//! a short-horizon mini-MPC rollout that scores candidate movement vectors,
//! plus a few guards (boundary projection, panic escape, i-frame opportunism).
//!
//! The champion only controls movement; upgrade and relic picks are delegated
//! to the shared "optimizer-mode" scoring helpers in `profiles.rs`.

use voidline_data::DataBundle;
use voidline_sim::engine::{
    EngineSnapshot, RelicChoiceRecord, SnapshotEnemy, SnapshotExperienceOrb, SnapshotPlayer,
    SnapshotPowerupOrb, SnapshotWorld, UpgradeChoiceRecord,
};

use crate::profiles::{
    champion_choose_relic, champion_choose_upgrade, RunPolicy,
};

const HORIZON_TICKS: usize = 45;
const TICK_DT: f64 = 1.0 / 60.0;
const CANDIDATE_DIRECTIONS: usize = 24;
const ENEMY_OBSERVATION_RADIUS: f64 = 900.0;
const ORB_OBSERVATION_RADIUS: f64 = 600.0;
const POWERUP_OBSERVATION_RADIUS: f64 = 700.0;
const SAFETY_PADDING: f64 = 18.0;

const ALPHA_DAMAGE: f64 = 80.0;
const BETA_PROXIMITY: f64 = 120.0;
const DELTA_BOUNDARY: f64 = 30.0;
const EPSILON_INERTIA: f64 = 0.02;
const ZETA_POTENTIAL: f64 = 4000.0;
const POTENTIAL_OFFSET_SQ: f64 = 3600.0;

const TAU_SAFE: f64 = 0.85;
const HEART_HP_THRESHOLD: f64 = 0.6;
const CONTACT_COOLDOWN: f64 = 0.34;

const PLAYER_VEL_SMOOTHING_BASE: f64 = 0.0009;
const ARENA_PADDING: f64 = 8.0;
const BOUNDARY_MARGIN: f64 = 280.0;
const CENTERING_WEIGHT: f64 = 4.0;

const FALLBACK_PICKUP_BASE_RADIUS: f64 = 36.0;
const POWERUP_PICKUP_PADDING: f64 = 6.0;

pub struct ChampionRunPolicy {}

impl ChampionRunPolicy {
    pub fn new() -> Self {
        Self {}
    }
}

impl Default for ChampionRunPolicy {
    fn default() -> Self {
        Self::new()
    }
}

impl RunPolicy for ChampionRunPolicy {
    fn movement_keys(&mut self, bundle: &DataBundle, snapshot: &EngineSnapshot) -> Vec<String> {
        let (dx, dy) = self.compute_movement(bundle, snapshot);
        vec_to_keys(dx, dy)
    }

    fn choose_upgrade(
        &mut self,
        bundle: &DataBundle,
        snapshot: &EngineSnapshot,
        choices: &[UpgradeChoiceRecord],
    ) -> Option<UpgradeChoiceRecord> {
        champion_choose_upgrade(bundle, snapshot, choices)
    }

    fn choose_relic(
        &mut self,
        bundle: &DataBundle,
        snapshot: &EngineSnapshot,
        choices: &[RelicChoiceRecord],
    ) -> Option<RelicChoiceRecord> {
        champion_choose_relic(bundle, snapshot, choices)
    }
}

impl ChampionRunPolicy {
    fn compute_movement(&mut self, bundle: &DataBundle, snap: &EngineSnapshot) -> (f64, f64) {
        let player = &snap.player;
        let speed = player.speed.max(1.0);

        let threats: Vec<&SnapshotEnemy> = snap
            .enemies
            .iter()
            .filter(|e| {
                sq_dist(e.x, e.y, player.x, player.y)
                    < ENEMY_OBSERVATION_RADIUS * ENEMY_OBSERVATION_RADIUS
            })
            .collect();

        let pickups: Vec<&SnapshotExperienceOrb> = snap
            .experience_orbs
            .iter()
            .filter(|o| {
                sq_dist(o.x, o.y, player.x, player.y)
                    < ORB_OBSERVATION_RADIUS * ORB_OBSERVATION_RADIUS
            })
            .collect();

        let powerups: Vec<&SnapshotPowerupOrb> = snap
            .powerup_orbs
            .iter()
            .filter(|p| {
                sq_dist(p.x, p.y, player.x, player.y)
                    < POWERUP_OBSERVATION_RADIUS * POWERUP_OBSERVATION_RADIUS
            })
            .collect();

        let candidates = candidate_directions();
        let xp_pickup_radius = bundle.balance.xp.pickup_base_radius.max(1.0)
            * player.pickup_radius.max(0.0);
        let xp_pickup_radius = if xp_pickup_radius < 1.0 {
            FALLBACK_PICKUP_BASE_RADIUS
        } else {
            xp_pickup_radius
        };

        let mut best_score = f64::NEG_INFINITY;
        let mut best_dir = (0.0, 0.0);
        let mut best_magnitude = f64::INFINITY;

        for &(cx, cy) in &candidates {
            let score = score_candidate(
                cx,
                cy,
                player,
                speed,
                &threats,
                &pickups,
                &powerups,
                snap,
                &snap.world,
                xp_pickup_radius,
            );
            let magnitude = (cx * cx + cy * cy).sqrt();
            if score > best_score + 1e-9
                || ((score - best_score).abs() < 1e-9 && magnitude < best_magnitude - 1e-9)
            {
                best_score = score;
                best_dir = (cx, cy);
                best_magnitude = magnitude;
            }
        }

        boundary_project(best_dir, player, &snap.world)
    }
}

fn candidate_directions() -> Vec<(f64, f64)> {
    let mut v = Vec::with_capacity(CANDIDATE_DIRECTIONS + 1);
    v.push((0.0, 0.0));
    let two_pi = std::f64::consts::TAU;
    for i in 0..CANDIDATE_DIRECTIONS {
        let theta = two_pi * (i as f64) / (CANDIDATE_DIRECTIONS as f64);
        v.push((theta.cos(), theta.sin()));
    }
    v
}

fn vec_to_keys(dx: f64, dy: f64) -> Vec<String> {
    let mut keys = Vec::new();
    if dx > 0.2 {
        keys.push("KeyD".to_string());
    } else if dx < -0.2 {
        keys.push("KeyA".to_string());
    }
    if dy > 0.2 {
        keys.push("KeyS".to_string());
    } else if dy < -0.2 {
        keys.push("KeyW".to_string());
    }
    keys
}

fn sq_dist(ax: f64, ay: f64, bx: f64, by: f64) -> f64 {
    let dx = ax - bx;
    let dy = ay - by;
    dx * dx + dy * dy
}

#[allow(clippy::too_many_arguments)]
fn score_candidate(
    cx: f64,
    cy: f64,
    player: &SnapshotPlayer,
    speed: f64,
    threats: &[&SnapshotEnemy],
    pickups: &[&SnapshotExperienceOrb],
    powerups: &[&SnapshotPowerupOrb],
    snap: &EngineSnapshot,
    world: &SnapshotWorld,
    xp_pickup_radius: f64,
) -> f64 {
    let target_vx = cx * speed;
    let target_vy = cy * speed;
    let mut px = player.x;
    let mut py = player.y;
    let mut vx = player.vx;
    let mut vy = player.vy;
    let smoothing = 1.0 - PLAYER_VEL_SMOOTHING_BASE.powf(TICK_DT);

    let lower_x = player.radius + ARENA_PADDING;
    let upper_x = world.arena_width - player.radius - ARENA_PADDING;
    let lower_y = player.radius + ARENA_PADDING;
    let upper_y = world.arena_height - player.radius - ARENA_PADDING;

    let mut sim_invuln = player.invuln;
    let kinetic_active = player.traits.kinetic_ram;

    let mut xp_value = 0.0;
    let mut hit_count = 0.0;
    let mut min_clearance = f64::INFINITY;
    let mut min_ttc = f64::INFINITY;
    let mut collected = Vec::with_capacity(pickups.len().min(8));
    let mut collected_pup = Vec::with_capacity(powerups.len().min(4));

    let mut enemy_positions: Vec<(f64, f64)> =
        threats.iter().map(|e| (e.x, e.y)).collect();

    for tick in 0..HORIZON_TICKS {
        vx += (target_vx - vx) * smoothing;
        vy += (target_vy - vy) * smoothing;
        px = (px + vx * TICK_DT).clamp(lower_x, upper_x);
        py = (py + vy * TICK_DT).clamp(lower_y, upper_y);
        sim_invuln = (sim_invuln - TICK_DT).max(0.0);
        let elapsed = (tick as f64 + 1.0) * TICK_DT;
        let player_speed_sq = vx * vx + vy * vy;

        for (i, enemy) in threats.iter().enumerate() {
            let (ex0, ey0) = enemy_positions[i];
            let chase_dx = px - ex0;
            let chase_dy = py - ey0;
            let chase_len = (chase_dx * chase_dx + chase_dy * chase_dy).sqrt().max(1.0);
            let ex = ex0 + chase_dx / chase_len * enemy.speed * TICK_DT;
            let ey = ey0 + chase_dy / chase_len * enemy.speed * TICK_DT;
            enemy_positions[i] = (ex, ey);

            let dx = px - ex;
            let dy = py - ey;
            let dist = (dx * dx + dy * dy).sqrt();
            let collision_r = enemy.radius + player.radius;
            let edge_to_collision = dist - collision_r;
            let safety_edge = dist - collision_r - SAFETY_PADDING;
            if safety_edge < min_clearance {
                min_clearance = safety_edge;
            }
            if edge_to_collision <= 0.0 && sim_invuln <= 0.0 {
                let mut hit = enemy.damage;
                if kinetic_active && player_speed_sq.sqrt() > 150.0 {
                    hit *= 0.5;
                }
                hit_count += hit;
                sim_invuln = CONTACT_COOLDOWN;
            }
            let approach_speed = enemy.speed.max(1.0);
            let ttc = if edge_to_collision > 0.0 {
                edge_to_collision / approach_speed
            } else {
                0.0
            };
            if ttc < min_ttc {
                min_ttc = ttc;
            }
        }

        for orb in pickups {
            if collected.contains(&orb.id) {
                continue;
            }
            let ox = orb.x + orb.vx * elapsed;
            let oy = orb.y + orb.vy * elapsed;
            let dx = px - ox;
            let dy = py - oy;
            if dx * dx + dy * dy < xp_pickup_radius * xp_pickup_radius {
                xp_value += orb.value;
                collected.push(orb.id);
            }
        }

        for pup in powerups {
            if collected_pup.contains(&pup.id) {
                continue;
            }
            let ox = pup.x + pup.vx * elapsed;
            let oy = pup.y + pup.vy * elapsed;
            let dx = px - ox;
            let dy = py - oy;
            let pickup_r = player.radius + pup.radius + POWERUP_PICKUP_PADDING;
            if dx * dx + dy * dy < pickup_r * pickup_r {
                xp_value += powerup_value(pup, player, snap);
                collected_pup.push(pup.id);
            }
        }
    }

    let mut boundary_pen = 0.0;
    if px < BOUNDARY_MARGIN {
        boundary_pen += (BOUNDARY_MARGIN - px) / BOUNDARY_MARGIN;
    }
    if px > world.arena_width - BOUNDARY_MARGIN {
        boundary_pen += (px - (world.arena_width - BOUNDARY_MARGIN)) / BOUNDARY_MARGIN;
    }
    if py < BOUNDARY_MARGIN {
        boundary_pen += (BOUNDARY_MARGIN - py) / BOUNDARY_MARGIN;
    }
    if py > world.arena_height - BOUNDARY_MARGIN {
        boundary_pen += (py - (world.arena_height - BOUNDARY_MARGIN)) / BOUNDARY_MARGIN;
    }

    let inv_ttc = if min_ttc < TAU_SAFE {
        (TAU_SAFE - min_ttc) / TAU_SAFE
    } else {
        0.0
    };

    let clearance_penalty = if min_clearance < 0.0 {
        -min_clearance
    } else {
        0.0
    };

    let inertia_bonus = -EPSILON_INERTIA * (cx * cx + cy * cy).sqrt();

    let mut potential = 0.0;
    for orb in pickups {
        if collected.contains(&orb.id) {
            continue;
        }
        let dx = orb.x - px;
        let dy = orb.y - py;
        potential += orb.value / (dx * dx + dy * dy + POTENTIAL_OFFSET_SQ);
    }
    for pup in powerups {
        if collected_pup.contains(&pup.id) {
            continue;
        }
        let dx = pup.x - px;
        let dy = pup.y - py;
        potential += powerup_value(pup, player, snap)
            / (dx * dx + dy * dy + POTENTIAL_OFFSET_SQ);
    }

    let safety_factor = if hit_count > 0.0 || min_clearance < 0.0 {
        0.0
    } else {
        1.0
    };

    let cx_arena = world.arena_width * 0.5;
    let cy_arena = world.arena_height * 0.5;
    let centering = ((px - cx_arena).powi(2) + (py - cy_arena).powi(2)).sqrt()
        / (world.arena_width.max(world.arena_height) * 0.5).max(1.0);
    let danger_count = threats
        .iter()
        .filter(|e| {
            let dx = e.x - player.x;
            let dy = e.y - player.y;
            dx * dx + dy * dy < 320_000.0
        })
        .count() as f64;
    let centering_pull = if danger_count > 2.0 {
        CENTERING_WEIGHT * centering
    } else {
        0.0
    };

    safety_factor * (xp_value + ZETA_POTENTIAL * potential)
        - ALPHA_DAMAGE * hit_count
        - BETA_PROXIMITY * inv_ttc * inv_ttc
        - 6.0 * clearance_penalty
        - DELTA_BOUNDARY * boundary_pen
        - centering_pull
        + inertia_bonus
}

fn powerup_value(pup: &SnapshotPowerupOrb, player: &SnapshotPlayer, snap: &EngineSnapshot) -> f64 {
    match pup.kind.as_str() {
        "heart" => {
            let hp_ratio = player.hp / player.max_hp.max(1.0);
            if hp_ratio < HEART_HP_THRESHOLD {
                200.0 * (HEART_HP_THRESHOLD - hp_ratio) / HEART_HP_THRESHOLD
            } else {
                10.0
            }
        }
        "magnet" => {
            let n = snap.experience_orbs.len() as f64;
            (n * 6.0).min(150.0).max(20.0)
        }
        "bomb" => {
            let in_range = snap
                .enemies
                .iter()
                .filter(|e| {
                    let dx = e.x - player.x;
                    let dy = e.y - player.y;
                    dx * dx + dy * dy < 320_000.0
                })
                .count() as f64;
            (in_range * 40.0).min(220.0)
        }
        _ => 5.0,
    }
}

fn boundary_project(
    dir: (f64, f64),
    player: &SnapshotPlayer,
    world: &SnapshotWorld,
) -> (f64, f64) {
    let mut dx = dir.0;
    let mut dy = dir.1;
    let edge = 30.0;
    if player.x < player.radius + edge {
        dx = dx.max(0.0);
    }
    if player.x > world.arena_width - player.radius - edge {
        dx = dx.min(0.0);
    }
    if player.y < player.radius + edge {
        dy = dy.max(0.0);
    }
    if player.y > world.arena_height - player.radius - edge {
        dy = dy.min(0.0);
    }
    let len = (dx * dx + dy * dy).sqrt();
    if len < 1e-9 {
        (0.0, 0.0)
    } else {
        (dx / len, dy / len)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use voidline_data::load_default;
    use voidline_sim::engine::{
        Engine, EngineConfig, EngineInput, SnapshotPlayerBonus, SnapshotPlayerTraits,
    };

    fn make_engine() -> Engine {
        let bundle = load_default().unwrap();
        Engine::new(
            bundle,
            EngineConfig {
                seed: Some(1234),
                width: None,
                height: None,
                dpr: None,
                account: None,
            },
        )
    }

    #[test]
    fn movement_is_deterministic_for_same_snapshot() {
        let mut engine = make_engine();
        let bundle = load_default().unwrap();
        engine.set_input(EngineInput {
            keys: vec![],
            pointer_x: 0.0,
            pointer_y: 0.0,
            pointer_inside: false,
            control_mode: "keyboard".to_string(),
        });
        // Step a few times so the world has enemies and orbs.
        for _ in 0..120 {
            engine.step(1.0 / 60.0);
        }
        let snap = engine.snapshot();
        let mut a = ChampionRunPolicy::new();
        let mut b = ChampionRunPolicy::new();
        let ka = a.movement_keys(&bundle, &snap);
        let kb = b.movement_keys(&bundle, &snap);
        assert_eq!(ka, kb);
    }

    #[test]
    fn movement_is_inert_when_world_is_empty() {
        let bundle = load_default().unwrap();
        let snap = empty_snapshot();
        let mut policy = ChampionRunPolicy::new();
        let keys = policy.movement_keys(&bundle, &snap);
        // No threats, no orbs, centered: idle is the highest-scoring candidate.
        assert!(keys.is_empty());
    }

    #[test]
    fn movement_runs_away_from_a_close_brute() {
        let bundle = load_default().unwrap();
        let mut snap = empty_snapshot();
        snap.enemies.push(make_enemy(
            1, "brute", 25.0, 80.0, snap.player.x + 60.0, snap.player.y, 60.0, "",
        ));
        let mut policy = ChampionRunPolicy::new();
        let keys = policy.movement_keys(&bundle, &snap);
        assert!(
            keys.iter().any(|k| k == "KeyA"),
            "expected leftward escape, got {keys:?}"
        );
    }

    #[test]
    fn movement_chases_a_solo_orb() {
        let bundle = load_default().unwrap();
        let mut snap = empty_snapshot();
        snap.experience_orbs.push(SnapshotExperienceOrb {
            id: 99,
            x: snap.player.x,
            y: snap.player.y - 220.0,
            vx: 0.0,
            vy: 0.0,
            radius: 6.0,
            value: 12.0,
            age: 0.5,
            magnetized: false,
        });
        let mut policy = ChampionRunPolicy::new();
        let keys = policy.movement_keys(&bundle, &snap);
        assert!(
            keys.iter().any(|k| k == "KeyW"),
            "expected upward chase, got {keys:?}"
        );
    }

    fn empty_snapshot() -> EngineSnapshot {
        let world = SnapshotWorld {
            width: 1280.0,
            height: 720.0,
            arena_width: 1600.0,
            arena_height: 1200.0,
            camera_x: 0.0,
            camera_y: 0.0,
            dpr: 1.0,
            time: 0.0,
            shake: 0.0,
        };
        let player = SnapshotPlayer {
            x: 800.0,
            y: 600.0,
            radius: 18.0,
            hp: 100.0,
            max_hp: 100.0,
            speed: 265.0,
            damage: 24.0,
            fire_rate: 3.0,
            bullet_speed: 610.0,
            projectile_count: 1.0,
            pierce: 0.0,
            drones: 0.0,
            shield: 0.0,
            shield_max: 0.0,
            shield_regen: 0.0,
            crit_chance: 0.0,
            lifesteal: 0.0,
            pickup_radius: 1.0,
            bullet_radius: 4.0,
            invuln: 0.0,
            fire_timer: 0.0,
            drone_timer: 0.0,
            aim_angle: 0.0,
            vx: 0.0,
            vy: 0.0,
            bonus: SnapshotPlayerBonus {
                fire_rate_pct: 0.0,
                damage_pct: 0.0,
                bullet_speed_pct: 0.0,
                speed_pct: 0.0,
                pickup_radius_pct: 0.0,
                bullet_radius_pct: 0.0,
            },
            traits: SnapshotPlayerTraits {
                rail_splitter: false,
                drone_swarm: false,
                kinetic_ram: false,
                magnet_storm: false,
            },
            ram_timer: 0.0,
            magnet_storm_charge: 0.0,
            magnet_storm_timer: 0.0,
        };
        EngineSnapshot {
            state: voidline_sim::engine::SnapshotState {
                mode: "running".to_string(),
                pressure: 0,
                stage: 1,
                start_stage: 1,
                stage_elapsed_seconds: 0.0,
                run_elapsed_seconds: 0.0,
                stage_boss_spawned: false,
                stage_boss_active: false,
                highest_stage_reached: 1,
                score: 0.0,
                phase_kills: 0,
                kills_by_kind: std::collections::HashMap::new(),
                enemy_pressure_target: 0,
                spawn_timer: 0.0,
                spawn_gap: 1.0,
                best_combo: 0,
                mini_boss_eligible_misses: 0,
                mini_boss_pending: false,
                mini_boss_last_pressure: 0,
                control_mode: "keyboard".to_string(),
                level: 1,
                xp: 0,
                xp_target: 6,
                pending_upgrades: 0,
                pending_chests: 0,
                hearts_carried: 0,
                magnets_carried: 0,
                bombs_carried: 0,
                run_boss_stages: vec![],
                run_reward_claimed: false,
            },
            world,
            player,
            enemies: vec![],
            bullets: vec![],
            experience_orbs: vec![],
            powerup_orbs: vec![],
            chests: vec![],
            counters: voidline_sim::engine::SnapshotCounters {
                next_enemy_id: 1,
                next_bullet_id: 1,
                next_experience_id: 1,
                next_powerup_id: 1,
                next_chest_id: 1,
            },
            owned_upgrades: vec![],
            owned_relics: vec![],
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn make_enemy(
        id: u32,
        kind: &str,
        damage: f64,
        speed: f64,
        x: f64,
        y: f64,
        radius: f64,
        role: &str,
    ) -> SnapshotEnemy {
        SnapshotEnemy {
            id,
            kind: kind.to_string(),
            score: 60.0,
            radius,
            hp: 80.0,
            max_hp: 80.0,
            speed,
            damage,
            color: "#fff".to_string(),
            accent: "#fff".to_string(),
            sides: 6,
            x,
            y,
            age: 1.0,
            seed: 0.0,
            wobble: 0.0,
            wobble_rate: 0.0,
            hit: 0.0,
            role: role.to_string(),
            contact_timer: 0.0,
            contact_cooldown: 0.34,
        }
    }
}
