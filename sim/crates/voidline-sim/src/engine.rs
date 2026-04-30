//! Browser/Node-facing engine facade.
//!
//! `Sim` is intentionally close to the TS simulation internals. `Engine`
//! wraps it with the operations TypeScript needs: account/loadout setup,
//! player input, upgrade/relic choices, and serializable snapshots.

use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};
use voidline_data::catalogs::{Relic, Upgrade, UpgradeTier};
use voidline_data::DataBundle;

use crate::balance_curves::select_upgrade_tier;
use crate::effects::run_effects;
use crate::entities::{Bullet, BulletSource, Enemy, EnemyKind, EnemyRole, ExperienceOrb};
use crate::input::InputState;
use crate::math::clamp;
use crate::rng::Mulberry32;
use crate::simulation::{Sim, SimConfig};
use crate::state::{ControlMode, GameMode};
use crate::synergies::{
    refresh_player_traits, OwnedRelic as SynergyOwnedRelic, OwnedUpgrade as SynergyOwnedUpgrade,
};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineAccountContext {
    pub selected_character_id: String,
    pub selected_weapon_id: String,
    pub selected_start_stage: u32,
    pub highest_start_stage_unlocked: u32,
    pub rarity_rank: u32,
    pub unlocked_technology_ids: Vec<String>,
    pub unlocked_build_tags: Vec<String>,
    pub unlocked_relic_ids: Vec<String>,
    pub level_up_choice_count: u32,
}

impl Default for EngineAccountContext {
    fn default() -> Self {
        Self {
            selected_character_id: "pilot".to_string(),
            selected_weapon_id: "pulse".to_string(),
            selected_start_stage: 1,
            highest_start_stage_unlocked: 1,
            rarity_rank: 0,
            unlocked_technology_ids: Vec::new(),
            unlocked_build_tags: Vec::new(),
            unlocked_relic_ids: Vec::new(),
            level_up_choice_count: 3,
        }
    }
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineConfig {
    pub seed: Option<u32>,
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub dpr: Option<f64>,
    pub account: Option<EngineAccountContext>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineInput {
    pub keys: Vec<String>,
    pub pointer_x: f64,
    pub pointer_y: f64,
    pub pointer_inside: bool,
    pub control_mode: String,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StressSeedConfig {
    pub enemies: u32,
    pub bullets: u32,
    pub orbs: u32,
    pub seed: u32,
    pub magnet: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineSnapshot {
    pub state: SnapshotState,
    pub world: SnapshotWorld,
    pub player: SnapshotPlayer,
    pub enemies: Vec<SnapshotEnemy>,
    pub bullets: Vec<SnapshotBullet>,
    pub experience_orbs: Vec<SnapshotExperienceOrb>,
    pub powerup_orbs: Vec<SnapshotPowerupOrb>,
    pub chests: Vec<SnapshotChest>,
    pub counters: SnapshotCounters,
    pub owned_upgrades: Vec<OwnedUpgradeRecord>,
    pub owned_relics: Vec<OwnedRelicRecord>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotState {
    pub mode: String,
    pub wave: u32,
    pub stage: u32,
    pub start_stage: u32,
    pub stage_elapsed_seconds: f64,
    pub run_elapsed_seconds: f64,
    pub stage_boss_spawned: bool,
    pub stage_boss_active: bool,
    pub highest_stage_reached: u32,
    pub score: f64,
    pub wave_kills: u32,
    pub kills_by_kind: HashMap<String, u32>,
    pub wave_target: u32,
    pub spawn_remaining: u32,
    pub spawn_timer: f64,
    pub spawn_gap: f64,
    pub wave_delay: f64,
    pub best_combo: u32,
    pub mini_boss_eligible_misses: u32,
    pub mini_boss_pending: bool,
    pub control_mode: String,
    pub level: u32,
    pub xp: u32,
    pub xp_target: u32,
    pub pending_upgrades: u32,
    pub pending_chests: u32,
    pub hearts_carried: u32,
    pub magnets_carried: u32,
    pub bombs_carried: u32,
    pub run_boss_waves: Vec<u32>,
    pub run_boss_stages: Vec<u32>,
    pub run_reward_claimed: bool,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotWorld {
    pub width: f64,
    pub height: f64,
    pub arena_width: f64,
    pub arena_height: f64,
    pub camera_x: f64,
    pub camera_y: f64,
    pub dpr: f64,
    pub time: f64,
    pub shake: f64,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotPlayer {
    pub x: f64,
    pub y: f64,
    pub radius: f64,
    pub hp: f64,
    pub max_hp: f64,
    pub speed: f64,
    pub damage: f64,
    pub fire_rate: f64,
    pub bullet_speed: f64,
    pub projectile_count: f64,
    pub pierce: f64,
    pub drones: f64,
    pub shield: f64,
    pub shield_max: f64,
    pub shield_regen: f64,
    pub crit_chance: f64,
    pub lifesteal: f64,
    pub pickup_radius: f64,
    pub bullet_radius: f64,
    pub invuln: f64,
    pub fire_timer: f64,
    pub drone_timer: f64,
    pub aim_angle: f64,
    pub vx: f64,
    pub vy: f64,
    pub bonus: SnapshotPlayerBonus,
    pub traits: SnapshotPlayerTraits,
    pub ram_timer: f64,
    pub magnet_storm_charge: f64,
    pub magnet_storm_timer: f64,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotPlayerBonus {
    pub fire_rate_pct: f64,
    pub damage_pct: f64,
    pub bullet_speed_pct: f64,
    pub speed_pct: f64,
    pub pickup_radius_pct: f64,
    pub bullet_radius_pct: f64,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotPlayerTraits {
    pub rail_splitter: bool,
    pub drone_swarm: bool,
    pub kinetic_ram: bool,
    pub magnet_storm: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotEnemy {
    pub id: u32,
    pub kind: String,
    pub score: f64,
    pub radius: f64,
    pub hp: f64,
    pub max_hp: f64,
    pub speed: f64,
    pub damage: f64,
    pub color: String,
    pub accent: String,
    pub sides: u32,
    pub x: f64,
    pub y: f64,
    pub age: f64,
    pub seed: f64,
    pub wobble: f64,
    pub wobble_rate: f64,
    pub hit: f64,
    pub role: String,
    pub contact_timer: f64,
    pub contact_cooldown: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotBullet {
    pub id: u32,
    pub x: f64,
    pub y: f64,
    pub vx: f64,
    pub vy: f64,
    pub radius: f64,
    pub damage: f64,
    pub pierce: i32,
    pub life: f64,
    pub color: String,
    pub trail: f64,
    pub hit_ids: Vec<u32>,
    pub source: String,
    pub chain_remaining: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotExperienceOrb {
    pub id: u32,
    pub x: f64,
    pub y: f64,
    pub vx: f64,
    pub vy: f64,
    pub radius: f64,
    pub value: f64,
    pub age: f64,
    pub magnetized: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotPowerupOrb {
    pub id: u32,
    pub x: f64,
    pub y: f64,
    pub vx: f64,
    pub vy: f64,
    pub radius: f64,
    pub kind: String,
    pub age: f64,
    pub life: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotChest {
    pub id: u32,
    pub x: f64,
    pub y: f64,
    pub vx: f64,
    pub vy: f64,
    pub radius: f64,
    pub age: f64,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotCounters {
    pub next_enemy_id: u32,
    pub next_bullet_id: u32,
    pub next_experience_id: u32,
    pub next_powerup_id: u32,
    pub next_chest_id: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpgradeChoiceRecord {
    pub upgrade_id: String,
    pub tier_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelicChoiceRecord {
    pub relic_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OwnedUpgradeRecord {
    pub upgrade_id: String,
    pub tier_id: String,
    pub tier_power: f64,
    pub count: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OwnedRelicRecord {
    pub relic_id: String,
    pub count: u32,
}

pub struct Engine {
    bundle: DataBundle,
    config: EngineConfig,
    account: EngineAccountContext,
    sim: Sim,
    owned_upgrades: Vec<OwnedUpgradeRecord>,
    owned_relics: Vec<OwnedRelicRecord>,
    cached_upgrade_choices: Vec<UpgradeChoiceRecord>,
    cached_relic_choices: Vec<RelicChoiceRecord>,
}

impl Engine {
    pub fn new(bundle: DataBundle, config: EngineConfig) -> Self {
        let account = normalize_account(&bundle, config.account.clone().unwrap_or_default());
        let sim_config = sim_config_from_engine(&account, config.seed.unwrap_or(0));
        let sim = Sim::new(&bundle, sim_config);
        let mut engine = Self {
            bundle,
            config,
            account,
            sim,
            owned_upgrades: Vec::new(),
            owned_relics: Vec::new(),
            cached_upgrade_choices: Vec::new(),
            cached_relic_choices: Vec::new(),
        };
        if let (Some(width), Some(height)) = (engine.config.width, engine.config.height) {
            engine.resize(width, height, engine.config.dpr.unwrap_or(1.0));
        }
        engine.apply_starting_loadout();
        engine
    }

    pub fn reset(&mut self, seed: Option<u32>, account: Option<EngineAccountContext>) {
        if let Some(seed) = seed {
            self.config.seed = Some(seed);
        }
        if let Some(account) = account {
            self.account = normalize_account(&self.bundle, account);
        }
        let sim_config = sim_config_from_engine(&self.account, self.config.seed.unwrap_or(0));
        self.sim.reset(sim_config);
        self.owned_upgrades.clear();
        self.owned_relics.clear();
        self.cached_upgrade_choices.clear();
        self.cached_relic_choices.clear();
        self.apply_starting_loadout();
        if let (Some(width), Some(height)) = (self.config.width, self.config.height) {
            self.resize(width, height, self.config.dpr.unwrap_or(1.0));
        }
    }

    pub fn update_account(&mut self, account: EngineAccountContext) {
        self.account = normalize_account(&self.bundle, account);
        self.cached_upgrade_choices.clear();
        self.cached_relic_choices.clear();
    }

    pub fn resize(&mut self, width: f64, height: f64, dpr: f64) {
        let width = width.floor().max(1.0);
        let height = height.floor().max(1.0);
        self.config.width = Some(width);
        self.config.height = Some(height);
        self.config.dpr = Some(dpr.max(0.25));
        self.sim.world.width = width;
        self.sim.world.height = height;
        self.sim.world.dpr = dpr.max(0.25);
        self.sim.world.arena_width = 3200.0_f64.max((width * 3.2).round());
        self.sim.world.arena_height = 2200.0_f64.max((height * 3.2).round());
        self.sim.player.x = clamp(
            self.sim.player.x,
            self.sim.player.radius + 8.0,
            self.sim.world.arena_width - self.sim.player.radius - 8.0,
        );
        self.sim.player.y = clamp(
            self.sim.player.y,
            self.sim.player.radius + 8.0,
            self.sim.world.arena_height - self.sim.player.radius - 8.0,
        );
        self.snap_camera();
    }

    pub fn set_input(&mut self, input: EngineInput) {
        self.sim.input = InputState {
            keys: input.keys.into_iter().collect(),
            pointer_x: input.pointer_x,
            pointer_y: input.pointer_y,
            pointer_inside: input.pointer_inside,
        };
        self.sim.control_mode = match input.control_mode.as_str() {
            "trackpad" => ControlMode::Trackpad,
            _ => ControlMode::Keyboard,
        };
        self.sim.state.control_mode = self.sim.control_mode;
    }

    pub fn start_wave(&mut self, wave: u32) {
        self.sim.force_start_wave(wave.max(1));
        self.cached_upgrade_choices.clear();
        self.cached_relic_choices.clear();
    }

    pub fn step(&mut self, dt: f64) {
        self.sim.step(dt);
    }

    pub fn seed_stress(&mut self, config: StressSeedConfig) {
        let mut rng = Mulberry32::new(config.seed);
        self.sim.state.mode = GameMode::Playing;
        self.sim.state.wave = 1;
        self.sim.state.spawn_remaining = 0;
        self.sim.state.spawn_timer = f64::INFINITY;
        self.sim.state.wave_target = config.enemies;
        self.sim.state.pending_upgrades = 0;
        self.sim.state.pending_chests = 0;
        self.sim.player.x = self.sim.world.arena_width / 2.0;
        self.sim.player.y = self.sim.world.arena_height / 2.0;
        self.sim.player.hp = 1.0e9;
        self.sim.player.max_hp = 1.0e9;
        self.sim.player.invuln = 1.0e9;
        self.sim.counters.reset();
        self.sim.pools.clear();
        self.sim.enemy_grid.clear();
        self.sim.enemies.clear();
        self.sim.bullets.clear();
        self.sim.experience_orbs.clear();
        self.sim.powerup_orbs.clear();
        self.sim.chests.clear();

        for _ in 0..config.enemies {
            let kind = stress_enemy_kind(rng.next_f64());
            let Some(enemy_type) = self
                .bundle
                .balance
                .enemies
                .iter()
                .find(|candidate| candidate.id == kind.as_str())
                .or_else(|| self.bundle.balance.enemies.first())
            else {
                continue;
            };
            self.sim.enemies.push(Enemy {
                id: self.sim.counters.next_enemy_id,
                kind,
                score: enemy_type.score,
                radius: enemy_type.radius,
                hp: enemy_type.hp,
                max_hp: enemy_type.hp,
                speed: enemy_type.speed,
                damage: enemy_type.damage,
                sides: enemy_type.sides,
                x: stress_coord(&mut rng, self.sim.world.arena_width),
                y: stress_coord(&mut rng, self.sim.world.arena_height),
                age: rng.next_f64() * 5.0,
                seed: rng.next_f64() * 100.0,
                wobble: if kind == EnemyKind::Brute { 0.08 } else { 0.18 },
                wobble_rate: 2.0 + rng.next_f64() * 2.0,
                hit: 0.0,
                role: EnemyRole::Normal,
                contact_timer: 0.0,
                contact_cooldown: 0.0,
            });
            self.sim.counters.next_enemy_id += 1;
        }

        for _ in 0..config.bullets {
            let angle = rng.next_f64() * std::f64::consts::TAU;
            self.sim.bullets.push(Bullet {
                id: self.sim.counters.next_bullet_id,
                x: stress_coord(&mut rng, self.sim.world.arena_width),
                y: stress_coord(&mut rng, self.sim.world.arena_height),
                vx: angle.cos() * 520.0,
                vy: angle.sin() * 520.0,
                radius: 5.0,
                damage: 4.0,
                pierce: 1,
                life: 1.15,
                trail: 0.0,
                hit_ids: Vec::new(),
                source: BulletSource::Player,
                chain_remaining: 0,
            });
            self.sim.counters.next_bullet_id += 1;
        }

        for _ in 0..config.orbs {
            self.sim.experience_orbs.push(ExperienceOrb {
                id: self.sim.counters.next_experience_id,
                x: stress_coord(&mut rng, self.sim.world.arena_width),
                y: stress_coord(&mut rng, self.sim.world.arena_height),
                vx: (rng.next_f64() - 0.5) * 60.0,
                vy: (rng.next_f64() - 0.5) * 60.0,
                radius: 6.0 + rng.next_f64() * 3.0,
                value: 1.0 + (rng.next_f64() * 5.0).floor(),
                age: rng.next_f64() * 0.4,
                magnetized: config.magnet,
            });
            self.sim.counters.next_experience_id += 1;
        }

        self.sim.enemy_grid.rebuild(&self.sim.enemies);
        self.sim.update_camera(true);
    }

    pub fn snapshot(&self) -> EngineSnapshot {
        snapshot_from_engine(self)
    }

    pub fn draft_upgrades(&mut self, count: u32) -> Vec<UpgradeChoiceRecord> {
        if !self.cached_upgrade_choices.is_empty() {
            return self.cached_upgrade_choices.clone();
        }
        let count = count.max(1) as usize;
        let mut candidates: Vec<usize> = self
            .bundle
            .upgrades
            .iter()
            .enumerate()
            .filter_map(|(idx, upgrade)| self.upgrade_available(upgrade).then_some(idx))
            .collect();
        shuffle_indices(&mut candidates, &mut self.sim.rng);

        let mut picked: Vec<usize> = candidates.drain(0..candidates.len().min(count)).collect();
        self.ensure_upgrade_draft_shape(&mut picked, &mut candidates);

        let mut choices = Vec::with_capacity(picked.len());
        for idx in picked {
            let tier = select_upgrade_tier(
                &self.bundle.balance,
                self.sim.state.wave,
                self.sim.rng.next_f64(),
                self.account.rarity_rank,
            );
            choices.push(UpgradeChoiceRecord {
                upgrade_id: self.bundle.upgrades[idx].id.clone(),
                tier_id: tier.id.clone(),
            });
        }
        self.cached_upgrade_choices = choices.clone();
        choices
    }

    pub fn apply_upgrade(&mut self, upgrade_id: &str, tier_id: &str) -> Result<(), String> {
        let upgrade = self
            .bundle
            .upgrades
            .iter()
            .find(|candidate| candidate.id == upgrade_id)
            .ok_or_else(|| format!("unknown upgrade: {upgrade_id}"))?;
        let tier = self
            .bundle
            .balance
            .tiers
            .iter()
            .find(|candidate| candidate.id == tier_id)
            .ok_or_else(|| format!("unknown tier: {tier_id}"))?;
        run_effects(
            &upgrade.effects,
            tier.power,
            &self.bundle.balance,
            &mut self.sim.player,
        );
        if let Some(owned) = self
            .owned_upgrades
            .iter_mut()
            .find(|owned| owned.upgrade_id == upgrade_id && owned.tier_id == tier_id)
        {
            owned.count += 1;
        } else {
            self.owned_upgrades.push(OwnedUpgradeRecord {
                upgrade_id: upgrade_id.to_string(),
                tier_id: tier_id.to_string(),
                tier_power: tier.power,
                count: 1,
            });
        }
        self.refresh_traits();
        self.sim.state.pending_upgrades = self.sim.state.pending_upgrades.saturating_sub(1);
        self.cached_upgrade_choices.clear();
        Ok(())
    }

    pub fn draft_relics(&mut self, count: u32) -> Vec<RelicChoiceRecord> {
        if !self.cached_relic_choices.is_empty() {
            return self.cached_relic_choices.clone();
        }
        let count = count.max(1) as usize;
        let unlocked: HashSet<&str> = self
            .account
            .unlocked_relic_ids
            .iter()
            .map(String::as_str)
            .collect();
        let owned: HashSet<&str> = self
            .owned_relics
            .iter()
            .map(|record| record.relic_id.as_str())
            .collect();
        let unlocked_tags: HashSet<&str> = self
            .account
            .unlocked_build_tags
            .iter()
            .map(String::as_str)
            .collect();
        let mut candidates: Vec<usize> = self
            .bundle
            .relics
            .iter()
            .enumerate()
            .filter_map(|(idx, relic)| {
                let available = unlocked.contains(relic.id.as_str())
                    && !owned.contains(relic.id.as_str())
                    && has_unlocked_tags(&relic.tags, &unlocked_tags);
                available.then_some(idx)
            })
            .collect();
        shuffle_indices(&mut candidates, &mut self.sim.rng);

        let mut choices: Vec<RelicChoiceRecord> = candidates
            .into_iter()
            .take(count)
            .map(|idx| RelicChoiceRecord {
                relic_id: self.bundle.relics[idx].id.clone(),
            })
            .collect();
        if choices.is_empty() {
            choices.push(RelicChoiceRecord {
                relic_id: self.bundle.fallback_relic.id.clone(),
            });
        }
        self.cached_relic_choices = choices.clone();
        choices
    }

    pub fn apply_relic(&mut self, relic_id: &str) -> Result<(), String> {
        let relic = self
            .bundle
            .relics
            .iter()
            .find(|candidate| candidate.id == relic_id)
            .unwrap_or(&self.bundle.fallback_relic);
        run_effects(
            &relic.effects,
            1.0,
            &self.bundle.balance,
            &mut self.sim.player,
        );
        if let Some(owned) = self
            .owned_relics
            .iter_mut()
            .find(|owned| owned.relic_id == relic.id)
        {
            owned.count += 1;
        } else {
            self.owned_relics.push(OwnedRelicRecord {
                relic_id: relic.id.clone(),
                count: 1,
            });
        }
        self.refresh_traits();
        self.sim.state.pending_chests = self.sim.state.pending_chests.saturating_sub(1);
        self.cached_relic_choices.clear();
        Ok(())
    }

    fn apply_starting_loadout(&mut self) {
        if let Some(character) = self
            .bundle
            .characters
            .iter()
            .find(|candidate| candidate.id == self.account.selected_character_id)
        {
            run_effects(
                &character.effects,
                1.0,
                &self.bundle.balance,
                &mut self.sim.player,
            );
        }
        if let Some(weapon) = self
            .bundle
            .weapons
            .iter()
            .find(|candidate| candidate.id == self.account.selected_weapon_id)
        {
            run_effects(
                &weapon.effects,
                1.0,
                &self.bundle.balance,
                &mut self.sim.player,
            );
        }
    }

    fn upgrade_available(&self, upgrade: &Upgrade) -> bool {
        let unlocked_tech: HashSet<&str> = self
            .account
            .unlocked_technology_ids
            .iter()
            .map(String::as_str)
            .collect();
        let unlocked_tags: HashSet<&str> = self
            .account
            .unlocked_build_tags
            .iter()
            .map(String::as_str)
            .collect();

        if upgrade.kind == "technology" && !unlocked_tech.contains(upgrade.id.as_str()) {
            return false;
        }
        if upgrade.kind == "weapon"
            && upgrade.weapon_id.as_deref() != Some(self.account.selected_weapon_id.as_str())
        {
            return false;
        }
        if !has_unlocked_tags(&upgrade.tags, &unlocked_tags) {
            return false;
        }
        if let Some(cap) = &upgrade.soft_cap {
            let current = match cap.stat.as_str() {
                "projectileCount" => self.sim.player.projectile_count,
                "drones" => self.sim.player.drones,
                "pierce" => self.sim.player.pierce,
                _ => 0.0,
            };
            if current >= cap.max {
                return false;
            }
        }
        true
    }

    fn ensure_upgrade_draft_shape(&self, picked: &mut [usize], remaining: &mut Vec<usize>) {
        if picked.is_empty() {
            return;
        }
        let counts = self.build_tag_counts();
        if counts.is_empty() {
            return;
        }
        let build_tags: HashSet<&str> = counts.keys().map(String::as_str).collect();
        ensure_draft_contains(
            &self.bundle.upgrades,
            picked,
            remaining,
            |upgrade| advances_partially_built_synergy(&upgrade.tags, &counts),
            &build_tags,
        );
        ensure_draft_contains(
            &self.bundle.upgrades,
            picked,
            remaining,
            |upgrade| tags_intersect(&upgrade.tags, &build_tags),
            &build_tags,
        );
        if !picked
            .iter()
            .any(|idx| !tags_intersect(&self.bundle.upgrades[*idx].tags, &build_tags))
        {
            ensure_draft_contains(
                &self.bundle.upgrades,
                picked,
                remaining,
                |upgrade| !tags_intersect(&upgrade.tags, &build_tags),
                &build_tags,
            );
        }
    }

    fn build_tag_counts(&self) -> HashMap<String, u32> {
        let mut counts = HashMap::new();
        for owned in &self.owned_upgrades {
            if let Some(upgrade) = self
                .bundle
                .upgrades
                .iter()
                .find(|candidate| candidate.id == owned.upgrade_id)
            {
                for tag in &upgrade.tags {
                    *counts.entry(tag.clone()).or_insert(0) += owned.count.max(1);
                }
            }
        }
        for owned in &self.owned_relics {
            if let Some(relic) = self.find_relic(&owned.relic_id) {
                for tag in &relic.tags {
                    *counts.entry(tag.clone()).or_insert(0) += owned.count.max(1);
                }
            }
        }
        counts
    }

    fn refresh_traits(&mut self) {
        let bundle = &self.bundle;
        let upgrades: Vec<SynergyOwnedUpgrade<'_>> = self
            .owned_upgrades
            .iter()
            .filter_map(|owned| {
                let upgrade = bundle
                    .upgrades
                    .iter()
                    .find(|candidate| candidate.id == owned.upgrade_id)?;
                Some(SynergyOwnedUpgrade {
                    upgrade,
                    tier_power: owned.tier_power,
                    count: owned.count,
                })
            })
            .collect();
        let relics: Vec<SynergyOwnedRelic<'_>> = self
            .owned_relics
            .iter()
            .filter_map(|owned| {
                let relic = bundle
                    .relics
                    .iter()
                    .find(|candidate| candidate.id == owned.relic_id)
                    .or_else(|| {
                        (bundle.fallback_relic.id == owned.relic_id)
                            .then_some(&bundle.fallback_relic)
                    })?;
                Some(SynergyOwnedRelic {
                    relic,
                    count: owned.count,
                })
            })
            .collect();
        refresh_player_traits(&mut self.sim.player, &upgrades, &relics);
    }

    fn find_relic(&self, id: &str) -> Option<&Relic> {
        self.bundle
            .relics
            .iter()
            .find(|candidate| candidate.id == id)
            .or_else(|| {
                (self.bundle.fallback_relic.id == id).then_some(&self.bundle.fallback_relic)
            })
    }

    fn snap_camera(&mut self) {
        let target_x = clamp(
            self.sim.player.x - self.sim.world.width / 2.0,
            0.0,
            (self.sim.world.arena_width - self.sim.world.width).max(0.0),
        );
        let target_y = clamp(
            self.sim.player.y - self.sim.world.height / 2.0,
            0.0,
            (self.sim.world.arena_height - self.sim.world.height).max(0.0),
        );
        self.sim.world.camera_x = target_x;
        self.sim.world.camera_y = target_y;
    }
}

fn normalize_account(
    bundle: &DataBundle,
    mut account: EngineAccountContext,
) -> EngineAccountContext {
    let starter_tech: HashSet<&str> = bundle
        .starter_technology_ids
        .iter()
        .map(String::as_str)
        .collect();
    let starter_tags: HashSet<&str> = bundle
        .starter_build_tags
        .iter()
        .map(String::as_str)
        .collect();
    for id in &bundle.starter_technology_ids {
        if !account
            .unlocked_technology_ids
            .iter()
            .any(|value| value == id)
        {
            account.unlocked_technology_ids.push(id.clone());
        }
    }
    for tag in &bundle.starter_build_tags {
        if !account.unlocked_build_tags.iter().any(|value| value == tag) {
            account.unlocked_build_tags.push(tag.clone());
        }
    }
    for id in &bundle.default_relic_ids {
        if !account.unlocked_relic_ids.iter().any(|value| value == id) {
            account.unlocked_relic_ids.push(id.clone());
        }
    }
    account.unlocked_technology_ids.retain(|id| {
        starter_tech.contains(id.as_str()) || bundle.upgrades.iter().any(|u| u.id == *id)
    });
    account.unlocked_build_tags.retain(|tag| {
        starter_tags.contains(tag.as_str())
            || bundle
                .shop_items
                .iter()
                .any(|item| item.tags.iter().any(|t| t == tag))
    });
    account
        .unlocked_relic_ids
        .retain(|id| bundle.relics.iter().any(|relic| relic.id == *id));
    account.rarity_rank = account.rarity_rank.min(3);
    account.level_up_choice_count = account.level_up_choice_count.max(1);
    account.highest_start_stage_unlocked = account.highest_start_stage_unlocked.max(1);
    account.selected_start_stage = account
        .selected_start_stage
        .max(1)
        .min(account.highest_start_stage_unlocked);
    if !bundle
        .characters
        .iter()
        .any(|character| character.id == account.selected_character_id)
    {
        account.selected_character_id = "pilot".to_string();
    }
    if !bundle
        .weapons
        .iter()
        .any(|weapon| weapon.id == account.selected_weapon_id)
    {
        account.selected_weapon_id = "pulse".to_string();
    }
    account
}

fn sim_config_from_engine(account: &EngineAccountContext, seed: u32) -> SimConfig {
    SimConfig {
        seed,
        start_stage: account.selected_start_stage.max(1),
        max_seconds: 120.0,
        max_wave: 10,
        step_seconds: 1.0 / 60.0,
    }
}

fn has_unlocked_tags(tags: &[String], unlocked: &HashSet<&str>) -> bool {
    tags.iter().all(|tag| unlocked.contains(tag.as_str()))
}

fn tags_intersect(tags: &[String], build_tags: &HashSet<&str>) -> bool {
    tags.iter().any(|tag| build_tags.contains(tag.as_str()))
}

fn advances_partially_built_synergy(
    tags: &[String],
    build_tag_counts: &HashMap<String, u32>,
) -> bool {
    const SYNERGIES: &[(&[&str], &[u32])] = &[
        (&["cannon", "crit", "pierce"], &[1, 1, 1]),
        (&["drone", "cannon"], &[1, 1]),
        (&["shield", "salvage"], &[1, 1]),
        (&["magnet"], &[2]),
    ];
    for (required_tags, required_counts) in SYNERGIES {
        let has_progress = required_tags
            .iter()
            .any(|tag| *build_tag_counts.get(*tag).unwrap_or(&0) > 0);
        let has_missing = required_tags
            .iter()
            .zip(*required_counts)
            .any(|(tag, required)| *build_tag_counts.get(*tag).unwrap_or(&0) < *required);
        let fills_missing = required_tags
            .iter()
            .zip(*required_counts)
            .any(|(tag, required)| {
                *build_tag_counts.get(*tag).unwrap_or(&0) < *required
                    && tags.iter().any(|candidate| candidate == tag)
            });
        if has_progress && has_missing && fills_missing {
            return true;
        }
    }
    false
}

fn ensure_draft_contains(
    upgrades: &[Upgrade],
    picked: &mut [usize],
    remaining: &mut Vec<usize>,
    predicate: impl Fn(&Upgrade) -> bool,
    build_tags: &HashSet<&str>,
) {
    if picked.iter().any(|idx| predicate(&upgrades[*idx])) {
        return;
    }
    let Some(replacement_index) = remaining.iter().position(|idx| predicate(&upgrades[*idx]))
    else {
        return;
    };
    let replacement = remaining.remove(replacement_index);
    let replace_at = replacement_slot(upgrades, picked, build_tags);
    let old = picked[replace_at];
    picked[replace_at] = replacement;
    remaining.push(old);
}

fn replacement_slot(upgrades: &[Upgrade], picked: &[usize], build_tags: &HashSet<&str>) -> usize {
    let support_count = picked
        .iter()
        .filter(|idx| tags_intersect(&upgrades[**idx].tags, build_tags))
        .count();
    if support_count > 1 {
        for index in (0..picked.len()).rev() {
            if tags_intersect(&upgrades[picked[index]].tags, build_tags) {
                return index;
            }
        }
    }
    picked.len() - 1
}

fn shuffle_indices(indices: &mut [usize], rng: &mut crate::rng::Mulberry32) {
    if indices.len() <= 1 {
        return;
    }
    for i in (1..indices.len()).rev() {
        let j = (rng.next_f64() * ((i + 1) as f64)).floor() as usize;
        indices.swap(i, j.min(i));
    }
}

fn stress_enemy_kind(roll: f64) -> EnemyKind {
    if roll < 0.55 {
        EnemyKind::Scout
    } else if roll < 0.85 {
        EnemyKind::Hunter
    } else {
        EnemyKind::Brute
    }
}

fn stress_coord(rng: &mut Mulberry32, arena_size: f64) -> f64 {
    if arena_size <= 200.0 {
        return arena_size / 2.0;
    }
    100.0 + rng.next_f64() * (arena_size - 200.0)
}

fn snapshot_from_engine(engine: &Engine) -> EngineSnapshot {
    let state = &engine.sim.state;
    let player = engine.sim.player;
    let world = engine.sim.world;
    EngineSnapshot {
        state: SnapshotState {
            mode: game_mode_str(state.mode).to_string(),
            wave: state.wave,
            stage: state.stage,
            start_stage: state.start_stage,
            stage_elapsed_seconds: state.stage_elapsed_seconds,
            run_elapsed_seconds: state.run_elapsed_seconds,
            stage_boss_spawned: state.stage_boss_spawned,
            stage_boss_active: state.stage_boss_active,
            highest_stage_reached: state.highest_stage_reached,
            score: state.score,
            wave_kills: state.wave_kills,
            kills_by_kind: state.kills_by_kind.clone(),
            wave_target: state.wave_target,
            spawn_remaining: state.spawn_remaining,
            spawn_timer: state.spawn_timer,
            spawn_gap: state.spawn_gap,
            wave_delay: state.wave_delay,
            best_combo: state.best_combo,
            mini_boss_eligible_misses: state.mini_boss_eligible_misses,
            mini_boss_pending: state.mini_boss_pending,
            control_mode: control_mode_str(state.control_mode).to_string(),
            level: state.level,
            xp: state.xp,
            xp_target: state.xp_target,
            pending_upgrades: state.pending_upgrades,
            pending_chests: state.pending_chests,
            hearts_carried: state.hearts_carried,
            magnets_carried: state.magnets_carried,
            bombs_carried: state.bombs_carried,
            run_boss_waves: state.run_boss_waves.clone(),
            run_boss_stages: state.run_boss_stages.clone(),
            run_reward_claimed: state.run_reward_claimed,
        },
        world: SnapshotWorld {
            width: world.width,
            height: world.height,
            arena_width: world.arena_width,
            arena_height: world.arena_height,
            camera_x: world.camera_x,
            camera_y: world.camera_y,
            dpr: world.dpr,
            time: world.time,
            shake: world.shake,
        },
        player: SnapshotPlayer {
            x: player.x,
            y: player.y,
            radius: player.radius,
            hp: player.hp,
            max_hp: player.max_hp,
            speed: player.speed,
            damage: player.damage,
            fire_rate: player.fire_rate,
            bullet_speed: player.bullet_speed,
            projectile_count: player.projectile_count,
            pierce: player.pierce,
            drones: player.drones,
            shield: player.shield,
            shield_max: player.shield_max,
            shield_regen: player.shield_regen,
            crit_chance: player.crit_chance,
            lifesteal: player.lifesteal,
            pickup_radius: player.pickup_radius,
            bullet_radius: player.bullet_radius,
            invuln: player.invuln,
            fire_timer: player.fire_timer,
            drone_timer: player.drone_timer,
            aim_angle: player.aim_angle,
            vx: player.vx,
            vy: player.vy,
            bonus: SnapshotPlayerBonus {
                fire_rate_pct: player.bonus.fire_rate_pct,
                damage_pct: player.bonus.damage_pct,
                bullet_speed_pct: player.bonus.bullet_speed_pct,
                speed_pct: player.bonus.speed_pct,
                pickup_radius_pct: player.bonus.pickup_radius_pct,
                bullet_radius_pct: player.bonus.bullet_radius_pct,
            },
            traits: SnapshotPlayerTraits {
                rail_splitter: player.traits.rail_splitter,
                drone_swarm: player.traits.drone_swarm,
                kinetic_ram: player.traits.kinetic_ram,
                magnet_storm: player.traits.magnet_storm,
            },
            ram_timer: player.ram_timer,
            magnet_storm_charge: player.magnet_storm_charge,
            magnet_storm_timer: player.magnet_storm_timer,
        },
        enemies: engine
            .sim
            .enemies
            .iter()
            .map(|enemy| {
                let (color, accent) = enemy_colors(engine, enemy.kind, enemy.role);
                SnapshotEnemy {
                    id: enemy.id,
                    kind: enemy.kind.as_str().to_string(),
                    score: enemy.score,
                    radius: enemy.radius,
                    hp: enemy.hp,
                    max_hp: enemy.max_hp,
                    speed: enemy.speed,
                    damage: enemy.damage,
                    color,
                    accent,
                    sides: enemy.sides,
                    x: enemy.x,
                    y: enemy.y,
                    age: enemy.age,
                    seed: enemy.seed,
                    wobble: enemy.wobble,
                    wobble_rate: enemy.wobble_rate,
                    hit: enemy.hit,
                    role: enemy_role_str(enemy.role).to_string(),
                    contact_timer: enemy.contact_timer,
                    contact_cooldown: enemy.contact_cooldown,
                }
            })
            .collect(),
        bullets: engine
            .sim
            .bullets
            .iter()
            .map(|bullet| SnapshotBullet {
                id: bullet.id,
                x: bullet.x,
                y: bullet.y,
                vx: bullet.vx,
                vy: bullet.vy,
                radius: bullet.radius,
                damage: bullet.damage,
                pierce: bullet.pierce,
                life: bullet.life,
                color: bullet_color(bullet.source).to_string(),
                trail: bullet.trail,
                hit_ids: bullet.hit_ids.clone(),
                source: bullet_source_str(bullet.source).to_string(),
                chain_remaining: bullet.chain_remaining,
            })
            .collect(),
        experience_orbs: engine
            .sim
            .experience_orbs
            .iter()
            .map(|orb| SnapshotExperienceOrb {
                id: orb.id,
                x: orb.x,
                y: orb.y,
                vx: orb.vx,
                vy: orb.vy,
                radius: orb.radius,
                value: orb.value,
                age: orb.age,
                magnetized: orb.magnetized,
            })
            .collect(),
        powerup_orbs: engine
            .sim
            .powerup_orbs
            .iter()
            .map(|orb| SnapshotPowerupOrb {
                id: orb.id,
                x: orb.x,
                y: orb.y,
                vx: orb.vx,
                vy: orb.vy,
                radius: orb.radius,
                kind: orb.kind.as_str().to_string(),
                age: orb.age,
                life: orb.life,
            })
            .collect(),
        chests: engine
            .sim
            .chests
            .iter()
            .map(|chest| SnapshotChest {
                id: chest.id,
                x: chest.x,
                y: chest.y,
                vx: chest.vx,
                vy: chest.vy,
                radius: chest.radius,
                age: chest.age,
            })
            .collect(),
        counters: SnapshotCounters {
            next_enemy_id: engine.sim.counters.next_enemy_id,
            next_bullet_id: engine.sim.counters.next_bullet_id,
            next_experience_id: engine.sim.counters.next_experience_id,
            next_powerup_id: engine.sim.counters.next_powerup_id,
            next_chest_id: engine.sim.counters.next_chest_id,
        },
        owned_upgrades: engine.owned_upgrades.clone(),
        owned_relics: engine.owned_relics.clone(),
    }
}

fn enemy_colors(engine: &Engine, kind: EnemyKind, role: EnemyRole) -> (String, String) {
    if role != EnemyRole::Normal {
        let role_key = enemy_role_str(role);
        if let Some(boss) = engine
            .bundle
            .bosses
            .iter()
            .find(|boss| boss.role == role_key)
        {
            return (boss.stats.color.clone(), boss.stats.accent.clone());
        }
    }
    if let Some(enemy) = engine
        .bundle
        .balance
        .enemies
        .iter()
        .find(|candidate| candidate.id == kind.as_str())
    {
        return (enemy.color.clone(), enemy.accent.clone());
    }
    ("#ffffff".to_string(), "#39d9ff".to_string())
}

fn game_mode_str(mode: GameMode) -> &'static str {
    match mode {
        GameMode::Menu => "menu",
        GameMode::Playing => "playing",
        GameMode::Paused => "paused",
        GameMode::Upgrade => "upgrade",
        GameMode::Chest => "chest",
        GameMode::Gameover => "gameover",
    }
}

fn control_mode_str(mode: ControlMode) -> &'static str {
    match mode {
        ControlMode::Keyboard => "keyboard",
        ControlMode::Trackpad => "trackpad",
    }
}

fn enemy_role_str(role: EnemyRole) -> &'static str {
    match role {
        EnemyRole::Normal => "normal",
        EnemyRole::MiniBoss => "mini-boss",
        EnemyRole::Boss => "boss",
    }
}

fn bullet_source_str(source: BulletSource) -> &'static str {
    match source {
        BulletSource::Player => "player",
        BulletSource::Drone => "drone",
        BulletSource::Chain => "chain",
    }
}

fn bullet_color(source: BulletSource) -> &'static str {
    match source {
        BulletSource::Player => "#39d9ff",
        BulletSource::Drone => "#ffbf47",
        BulletSource::Chain => "#ff5af0",
    }
}

fn _assert_tier_send_sync(_: &UpgradeTier) {}

#[cfg(test)]
mod tests {
    use super::*;
    use voidline_data::load_default;

    #[test]
    fn engine_snapshots_playable_state() {
        let bundle = load_default().unwrap();
        let mut engine = Engine::new(bundle, EngineConfig::default());
        engine.resize(1440.0, 900.0, 1.0);
        engine.step(1.0 / 60.0);
        let snapshot = engine.snapshot();
        assert_eq!(snapshot.state.mode, "playing");
        assert_eq!(snapshot.state.wave, 1);
        assert!(snapshot.world.width >= 1.0);
        assert!(snapshot.player.hp > 0.0);
    }

    #[test]
    fn engine_drafts_and_applies_upgrade_choices() {
        let bundle = load_default().unwrap();
        let mut engine = Engine::new(bundle, EngineConfig::default());
        engine.sim.state.pending_upgrades = 1;
        let choices = engine.draft_upgrades(3);
        assert!(!choices.is_empty());
        let first = choices[0].clone();
        engine
            .apply_upgrade(&first.upgrade_id, &first.tier_id)
            .expect("apply upgrade");
        let snapshot = engine.snapshot();
        assert_eq!(snapshot.state.pending_upgrades, 0);
        assert_eq!(snapshot.owned_upgrades.len(), 1);
    }

    #[test]
    fn engine_owns_pending_chest_consumption() {
        let bundle = load_default().unwrap();
        let mut engine = Engine::new(bundle, EngineConfig::default());
        engine.sim.state.pending_chests = 2;

        engine.apply_relic("rail-focus").expect("apply relic");

        let snapshot = engine.snapshot();
        assert_eq!(snapshot.state.pending_chests, 1);
        assert_eq!(snapshot.owned_relics.len(), 1);
    }

    #[test]
    fn engine_spawns_stage_boss_from_rust_timer() {
        let bundle = load_default().unwrap();
        let mut engine = Engine::new(bundle, EngineConfig::default());
        engine.sim.enemies.clear();
        engine.sim.state.wave_kills = 2;
        engine.sim.state.wave_target = 10;
        engine.sim.state.spawn_remaining = 4;
        engine.sim.state.stage_elapsed_seconds = engine.sim.stage_duration_seconds - 0.01;

        engine.step(0.02);

        let snapshot = engine.snapshot();
        assert!(snapshot.state.stage_boss_active);
        assert_eq!(snapshot.state.spawn_remaining, 0);
        assert_eq!(snapshot.state.wave_target, 3);
        assert!(snapshot.enemies.iter().any(|enemy| enemy.role == "boss"));
    }
}
