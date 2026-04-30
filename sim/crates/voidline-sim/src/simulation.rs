//! `Sim` — main orchestrator that owns all gameplay state and runs frames.
//! Mirrors the relevant subset of `src/simulation/simulation.ts`.
//!
//! This is the headless equivalent: no rendering, particles, sound, or
//! camera-following input — everything that affects gameplay outcomes is
//! preserved.

use std::sync::Arc;

use voidline_data::balance::Balance;
use voidline_data::catalogs::{BossDef, EnemySpawnRules, EnemyType};
use voidline_data::DataBundle;

use crate::balance_curves::{spawn_gap, spawn_pack_chance, wave_target, xp_to_next_level};
use crate::bullets::update_bullets;
use crate::chests::update_chests;
use crate::enemies::{reap_dead_enemies, update_enemies};
use crate::entities::{Bullet, ChestEntity, Enemy, ExperienceOrb, PowerupOrb};
use crate::experience::update_experience;
use crate::input::InputState;
use crate::math::clamp;
use crate::player::Player;
use crate::player_update::update_player;
use crate::pools::EntityPools;
use crate::powerups::{update_powerups, BombSideEffect};
use crate::rng::Mulberry32;
use crate::roguelike::{
    next_mini_boss_misses, should_spawn_mini_boss, starting_wave_for_stage,
};
use crate::spatial_grid::SpatialGrid;
use crate::spawn::{find_boss_def, select_enemy_type, spawn_elite, spawn_enemy, SpawnRolls};
use crate::state::{ControlMode, EntityCounters, GameMode, GameState};
use crate::world::World;

const STAGE_DURATION_FALLBACK: f64 = 600.0;

#[derive(Debug, Clone, Copy)]
pub struct SimConfig {
    pub seed: u32,
    pub start_stage: u32,
    pub max_seconds: f64,
    pub max_wave: u32,
    pub step_seconds: f64,
}

impl Default for SimConfig {
    fn default() -> Self {
        Self {
            seed: 0,
            start_stage: 1,
            max_seconds: 120.0,
            max_wave: 10,
            step_seconds: 1.0 / 60.0,
        }
    }
}

#[derive(Debug)]
pub struct Sim {
    pub balance: Arc<Balance>,
    pub spawn_rules: EnemySpawnRules,
    pub bosses: Vec<BossDef>,
    pub world: World,
    pub state: GameState,
    pub player: Player,
    pub rng: Mulberry32,
    pub input: InputState,
    pub enemies: Vec<Enemy>,
    pub bullets: Vec<Bullet>,
    pub experience_orbs: Vec<ExperienceOrb>,
    pub powerup_orbs: Vec<PowerupOrb>,
    pub chests: Vec<ChestEntity>,
    pub counters: EntityCounters,
    pub pools: EntityPools,
    pub enemy_grid: SpatialGrid,
    pub max_enemy_radius: f64,
    pub control_mode: ControlMode,
    pub stage_duration_seconds: f64,
}

impl Sim {
    pub fn new(bundle: &DataBundle, config: SimConfig) -> Self {
        let balance = Arc::new(bundle.balance.clone());
        let spawn_rules = bundle.enemy_spawn_rules.clone();
        let bosses = bundle.bosses.clone();
        let max_enemy_radius = bundle
            .balance
            .enemies
            .iter()
            .map(|e| e.radius)
            .fold(0.0_f64, f64::max)
            * bundle.balance.bosses.boss.radius_multiplier;
        let max_enemy_radius = max_enemy_radius.ceil();
        let cell_size = (max_enemy_radius * 2.4).ceil().max(72.0);

        let mut sim = Self {
            balance: balance.clone(),
            spawn_rules,
            bosses,
            world: World::default(),
            state: GameState::default(),
            player: Player::new(&bundle.balance.player.stats),
            rng: Mulberry32::new(config.seed),
            input: InputState::default(),
            enemies: Vec::new(),
            bullets: Vec::new(),
            experience_orbs: Vec::new(),
            powerup_orbs: Vec::new(),
            chests: Vec::new(),
            counters: EntityCounters::default(),
            pools: EntityPools::default(),
            enemy_grid: SpatialGrid::new(cell_size),
            max_enemy_radius,
            control_mode: ControlMode::Keyboard,
            stage_duration_seconds: balance.bosses.stage_duration_seconds.max(0.0).max(STAGE_DURATION_FALLBACK),
        };
        sim.reset(config);
        sim
    }

    pub fn reset(&mut self, config: SimConfig) {
        self.rng = Mulberry32::new(config.seed);
        let start_stage = config.start_stage.max(1);
        self.state = GameState::default();
        self.state.mode = GameMode::Playing;
        self.state.start_stage = start_stage;
        self.state.stage = start_stage;
        self.state.highest_stage_reached = start_stage;
        self.state.wave = starting_wave_for_stage(&self.balance, start_stage);
        self.state.xp_target = xp_to_next_level(&self.balance, self.state.level) as u32;
        self.state.level = 1;
        self.player = Player::new(&self.balance.player.stats);
        self.player.invuln = self.balance.player.reset_invulnerability;
        self.player.x = self.world.arena_width / 2.0;
        self.player.y = self.world.arena_height / 2.0;
        self.counters.reset();
        self.enemies.clear();
        self.bullets.clear();
        self.experience_orbs.clear();
        self.powerup_orbs.clear();
        self.chests.clear();
        self.pools.clear();
        self.enemy_grid.clear();
        self.start_wave(self.state.wave);
    }

    fn start_wave(&mut self, wave: u32) {
        self.state.mode = GameMode::Playing;
        self.state.wave = wave;
        self.state.wave_kills = 0;
        let base_target = wave_target(&self.balance, wave) as u32;
        let spawn_mini = should_spawn_mini_boss(
            &self.balance,
            wave,
            self.state.mini_boss_eligible_misses,
            self.rng.next_f64(),
        );
        self.state.mini_boss_eligible_misses = next_mini_boss_misses(
            &self.balance,
            wave,
            self.state.mini_boss_eligible_misses,
            spawn_mini,
        );
        self.state.mini_boss_pending = spawn_mini;
        self.state.wave_target = base_target + if spawn_mini { 1 } else { 0 };
        self.state.spawn_remaining = base_target;
        self.state.spawn_gap = spawn_gap(&self.balance, wave);
        self.state.spawn_timer = self.balance.wave.spawn_timer_start;
        self.state.wave_delay = 0.0;
    }

    fn update_wave(&mut self, dt: f64) {
        if self.state.mini_boss_pending {
            let elite_present = self
                .enemies
                .iter()
                .any(|e| matches!(e.role, crate::entities::EnemyRole::Boss | crate::entities::EnemyRole::MiniBoss));
            if self.state.stage_boss_active || self.state.stage_boss_spawned || elite_present {
                self.state.mini_boss_pending = false;
            } else {
                self.spawn_mini_boss();
                self.state.mini_boss_pending = false;
            }
        }

        self.state.spawn_timer -= dt;
        if self.state.spawn_remaining > 0 && self.state.spawn_timer <= 0.0 {
            let pack = if self.rng.next_f64() < spawn_pack_chance(&self.balance, self.state.wave) {
                2
            } else {
                1
            }
            .min(self.state.spawn_remaining);
            for _ in 0..pack {
                self.spawn_normal_enemy();
            }
            self.state.spawn_remaining -= pack;
            let jitter = 0.72 + self.rng.next_f64() * 0.7;
            self.state.spawn_timer = self.state.spawn_gap * jitter;
        }
    }

    fn spawn_normal_enemy(&mut self) {
        let rolls = SpawnRolls {
            position_rolls: [
                self.rng.next_f64(),
                self.rng.next_f64(),
                self.rng.next_f64(),
            ],
            kind_roll: self.rng.next_f64(),
            seed_roll: self.rng.next_f64(),
            wobble_roll: self.rng.next_f64(),
        };
        spawn_enemy(
            &self.balance,
            &self.spawn_rules,
            &mut self.pools,
            &mut self.counters,
            &mut self.enemies,
            &self.world,
            self.state.wave,
            rolls,
        );
    }

    fn spawn_mini_boss(&mut self) {
        let offsets = &self.balance.bosses.spawn_offsets.mini_boss;
        let wave = self.state.wave;
        let ty: EnemyType = if (wave as f64) >= offsets.eligible_from_wave {
            select_enemy_type(
                &self.balance,
                &self.spawn_rules,
                wave + offsets.offset as u32,
                self.rng.next_f64(),
            )
            .clone()
        } else {
            select_enemy_type(
                &self.balance,
                &self.spawn_rules,
                offsets.fallback_wave as u32,
                offsets.fallback_roll,
            )
            .clone()
        };
        let boss_def = find_boss_def(&self.bosses, "mini-boss").clone();
        let rolls = SpawnRolls {
            position_rolls: [
                self.rng.next_f64(),
                self.rng.next_f64(),
                self.rng.next_f64(),
            ],
            kind_roll: 0.0,
            seed_roll: self.rng.next_f64(),
            wobble_roll: 0.0,
        };
        spawn_elite(
            &self.balance,
            &mut self.pools,
            &mut self.counters,
            &mut self.enemies,
            &self.world,
            self.state.wave,
            &ty,
            &boss_def,
            rolls,
        );
    }

    fn spawn_stage_boss(&mut self) {
        let offsets = &self.balance.bosses.spawn_offsets.stage_boss;
        let wave = self.state.wave + (self.state.stage as u32) * (offsets.stage_multiplier as u32) + offsets.offset as u32;
        let ty = select_enemy_type(&self.balance, &self.spawn_rules, wave, offsets.roll).clone();
        let boss_def = find_boss_def(&self.bosses, "boss").clone();
        let rolls = SpawnRolls {
            position_rolls: [
                self.rng.next_f64(),
                self.rng.next_f64(),
                self.rng.next_f64(),
            ],
            kind_roll: 0.0,
            seed_roll: self.rng.next_f64(),
            wobble_roll: 0.0,
        };
        spawn_elite(
            &self.balance,
            &mut self.pools,
            &mut self.counters,
            &mut self.enemies,
            &self.world,
            self.state.wave,
            &ty,
            &boss_def,
            rolls,
        );
    }

    fn update_stage_progress(&mut self, dt: f64) {
        self.state.run_elapsed_seconds += dt;
        self.state.stage_elapsed_seconds += dt;
        self.state.highest_stage_reached =
            self.state.highest_stage_reached.max(self.state.stage);

        let elite_present = self
            .enemies
            .iter()
            .any(|e| matches!(e.role, crate::entities::EnemyRole::Boss | crate::entities::EnemyRole::MiniBoss));
        if !self.state.stage_boss_spawned
            && !self.state.stage_boss_active
            && !elite_present
            && self.state.stage_elapsed_seconds >= self.stage_duration_seconds
        {
            self.state.stage_boss_spawned = true;
            self.state.stage_boss_active = true;
            self.state.mini_boss_pending = false;
            self.state.spawn_remaining = 0;
            self.state.wave_target = (self.state.wave_kills + 1).max(1);
            self.state.wave_delay = 0.0;
            self.spawn_stage_boss();
        }
    }

    fn update_camera(&mut self, snap: bool) {
        let target_x = clamp(
            self.player.x - self.world.width / 2.0,
            0.0,
            (self.world.arena_width - self.world.width).max(0.0),
        );
        let target_y = clamp(
            self.player.y - self.world.height / 2.0,
            0.0,
            (self.world.arena_height - self.world.height).max(0.0),
        );
        let follow = if snap { 1.0 } else { 0.16 };
        self.world.camera_x += (target_x - self.world.camera_x) * follow;
        self.world.camera_y += (target_y - self.world.camera_y) * follow;
    }

    pub fn step(&mut self, dt: f64) {
        let capped_dt = dt.min(0.033).max(0.0);
        self.world.time += capped_dt;
        self.world.shake = (self.world.shake - capped_dt * 18.0).max(0.0);

        if self.state.mode != GameMode::Playing {
            return;
        }
        if self.state.pending_upgrades > 0 || self.state.pending_chests > 0 {
            return;
        }

        self.update_stage_progress(capped_dt);
        self.update_wave(capped_dt);
        self.enemy_grid.rebuild(&self.enemies);

        update_player(
            &self.balance,
            &mut self.pools,
            &mut self.counters,
            &mut self.bullets,
            &self.enemies,
            &self.enemy_grid,
            &mut self.player,
            &self.world,
            &self.input,
            self.control_mode,
            &mut self.rng,
            capped_dt,
        );

        let _killed = update_bullets(
            &mut self.pools,
            &mut self.bullets,
            &mut self.enemies,
            &mut self.enemy_grid,
            &mut self.player,
            &self.world,
            capped_dt,
            &mut self.counters,
            self.max_enemy_radius,
        );

        update_enemies(
            &self.balance,
            &mut self.pools,
            &mut self.counters,
            &mut self.state,
            &mut self.player,
            &mut self.world,
            &mut self.enemies,
            &mut self.bullets,
            &mut self.chests,
            &mut self.experience_orbs,
            &mut self.powerup_orbs,
            &mut self.rng,
            capped_dt,
            false,
        );

        // Reap any enemies that died from bullets
        reap_dead_enemies(
            &self.balance,
            &mut self.pools,
            &mut self.counters,
            &mut self.state,
            &mut self.player,
            &mut self.world,
            &mut self.enemies,
            &mut self.chests,
            &mut self.experience_orbs,
            &mut self.powerup_orbs,
            &mut self.rng,
            false,
        );

        update_experience(
            &self.balance,
            &mut self.pools,
            &mut self.state,
            &mut self.player,
            &mut self.experience_orbs,
            capped_dt,
        );

        let bomb_effects = update_powerups(
            &self.balance,
            &mut self.pools,
            &mut self.state,
            &mut self.player,
            &mut self.experience_orbs,
            &mut self.powerup_orbs,
            capped_dt,
        );
        for effect in bomb_effects {
            if matches!(effect, BombSideEffect::KillAllEnemies) {
                let mut i = self.enemies.len();
                while i > 0 {
                    i -= 1;
                    crate::enemies::kill_enemy(
                        &self.balance,
                        &mut self.pools,
                        &mut self.counters,
                        &mut self.state,
                        &mut self.player,
                        &mut self.world,
                        &mut self.enemies,
                        &mut self.chests,
                        &mut self.experience_orbs,
                        &mut self.powerup_orbs,
                        &mut self.rng,
                        i,
                        true,
                    );
                }
            }
        }

        update_chests(
            &mut self.pools,
            &mut self.state,
            &self.player,
            &mut self.chests,
            capped_dt,
        );

        self.update_camera(false);

        if self.player.hp <= 0.0 && self.state.mode == GameMode::Playing {
            self.player.hp = 0.0;
            self.state.mode = GameMode::Gameover;
        }

        if self.state.spawn_remaining == 0
            && self.enemies.is_empty()
            && self.state.mode == GameMode::Playing
        {
            self.state.wave_delay += capped_dt;
            if self.state.wave_delay > self.balance.wave.wave_delay {
                self.start_wave(self.state.wave + 1);
            }
        }
    }

    pub fn run_until(&mut self, max_seconds: f64, max_wave: u32, step_seconds: f64) {
        let mut elapsed = 0.0;
        while elapsed < max_seconds
            && self.state.mode != GameMode::Gameover
            && self.state.wave < max_wave
        {
            self.step(step_seconds);
            elapsed += step_seconds;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use voidline_data::load_default;

    #[test]
    fn sim_initializes_with_baseline_player() {
        let bundle = load_default().unwrap();
        let sim = Sim::new(&bundle, SimConfig::default());
        assert_eq!(sim.player.hp, 100.0);
        assert_eq!(sim.state.wave, 1);
        assert_eq!(sim.state.mode, GameMode::Playing);
    }

    #[test]
    fn sim_runs_idle_for_few_steps_without_panic() {
        let bundle = load_default().unwrap();
        let mut sim = Sim::new(&bundle, SimConfig {
            seed: 42,
            start_stage: 1,
            max_seconds: 5.0,
            max_wave: 3,
            step_seconds: 1.0 / 60.0,
        });
        for _ in 0..120 {
            sim.step(1.0 / 60.0);
        }
        // Idle player should take damage eventually
        assert!(sim.state.run_elapsed_seconds > 0.0);
    }
}
