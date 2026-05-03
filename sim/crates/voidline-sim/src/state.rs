//! Game state mirroring `src/state.ts:state` and `src/types.ts:GameState`.

use std::collections::HashMap;

use crate::entities::{EnemyKind, EnemyRole};

#[derive(Debug, Clone)]
pub struct EnemyDeathEvent {
    pub x: f64,
    pub y: f64,
    pub radius: f64,
    pub kind: EnemyKind,
    pub role: EnemyRole,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GameMode {
    Menu,
    Playing,
    Paused,
    Upgrade,
    Chest,
    Gameover,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ControlMode {
    Keyboard,
    Trackpad,
}

#[derive(Debug, Clone)]
pub struct GameState {
    pub mode: GameMode,
    pub pressure: u32,
    pub stage: u32,
    pub start_stage: u32,
    pub stage_elapsed_seconds: f64,
    pub run_elapsed_seconds: f64,
    pub stage_boss_spawned: bool,
    pub stage_boss_active: bool,
    pub highest_stage_reached: u32,
    pub score: f64,
    pub phase_kills: u32,
    pub kills_by_kind: HashMap<String, u32>,
    pub enemy_pressure_target: u32,
    pub spawn_timer: f64,
    pub spawn_gap: f64,
    pub best_combo: u32,
    pub mini_boss_eligible_misses: u32,
    pub mini_boss_pending: bool,
    pub mini_boss_last_pressure: u32,
    pub control_mode: ControlMode,
    pub level: u32,
    pub xp: u32,
    pub xp_target: u32,
    pub pending_upgrades: u32,
    pub pending_chests: u32,
    pub hearts_carried: u32,
    pub magnets_carried: u32,
    pub bombs_carried: u32,
    pub run_boss_stages: Vec<u32>,
    pub run_reward_claimed: bool,
    pub deaths_this_frame: Vec<EnemyDeathEvent>,
}

impl Default for GameState {
    fn default() -> Self {
        let mut kills = HashMap::new();
        kills.insert("scout".to_string(), 0);
        kills.insert("hunter".to_string(), 0);
        kills.insert("brute".to_string(), 0);
        Self {
            mode: GameMode::Menu,
            pressure: 1,
            stage: 1,
            start_stage: 1,
            stage_elapsed_seconds: 0.0,
            run_elapsed_seconds: 0.0,
            stage_boss_spawned: false,
            stage_boss_active: false,
            highest_stage_reached: 1,
            score: 0.0,
            phase_kills: 0,
            kills_by_kind: kills,
            enemy_pressure_target: 0,
            spawn_timer: 0.0,
            spawn_gap: 0.7,
            best_combo: 0,
            mini_boss_eligible_misses: 0,
            mini_boss_pending: false,
            mini_boss_last_pressure: 0,
            control_mode: ControlMode::Keyboard,
            level: 1,
            xp: 0,
            xp_target: 0,
            pending_upgrades: 0,
            pending_chests: 0,
            hearts_carried: 0,
            magnets_carried: 0,
            bombs_carried: 0,
            run_boss_stages: Vec::new(),
            run_reward_claimed: false,
            deaths_this_frame: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub struct EntityCounters {
    pub next_enemy_id: u32,
    pub next_bullet_id: u32,
    pub next_experience_id: u32,
    pub next_powerup_id: u32,
    pub next_chest_id: u32,
}

impl EntityCounters {
    pub fn reset(&mut self) {
        self.next_enemy_id = 1;
        self.next_bullet_id = 1;
        self.next_experience_id = 1;
        self.next_powerup_id = 1;
        self.next_chest_id = 1;
    }
}
