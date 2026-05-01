//! `MetaProgressionEnv` — Gym-like API exposing meta-progression state +
//! actions to a policy. Each `step` either purchases a meta-upgrade or
//! runs one trial via `voidline_sim::Sim`.

use std::path::PathBuf;

use voidline_data::DataBundle;

use voidline_sim::effects::run_effects;
use voidline_sim::simulation::{Sim, SimConfig};
use voidline_sim::state::GameMode;

use crate::account::{
    apply_run_reward, can_purchase, current_rarity_rank, purchase, AccountSnapshot, PurchaseError,
    RunOutcome,
};
use crate::profiles::{
    run_active_profile_trial, ActiveRunOptions, PlayerProfileId, ProfileRunSummary, RunStatSnapshot,
};

#[derive(Debug, Clone)]
pub enum MetaAction {
    Purchase(String),
    NextRun,
}

#[derive(Debug, Clone)]
pub struct StepResult {
    pub reward: f64,
    pub done: bool,
    pub kind: StepKind,
    pub crystals_after: u64,
    pub final_pressure: Option<u32>,
}

#[derive(Debug, Clone)]
pub enum StepKind {
    Purchase {
        upgrade_id: String,
        cost: u64,
    },
    Run {
        pressure: u32,
        score: u64,
        boss_stages: Vec<u32>,
        died: bool,
        profile: ProfileRunSummary,
    },
    Failed(PurchaseError),
    PolicyFailed(String),
}

pub struct MetaProgressionEnv<'a> {
    pub bundle: &'a DataBundle,
    pub account: AccountSnapshot,
    pub run_index: u32,
    pub seed_offset: u32,
    pub max_seconds: f64,
    pub max_pressure: u32,
    pub step_seconds: f64,
    pub player_profile: PlayerProfileId,
    pub max_decisions_per_run: u32,
    pub learned_model_dir: Option<PathBuf>,
}

impl<'a> MetaProgressionEnv<'a> {
    pub fn new(bundle: &'a DataBundle, seed_offset: u32) -> Self {
        Self {
            bundle,
            account: AccountSnapshot::default(),
            run_index: 0,
            seed_offset,
            max_seconds: 240.0,
            max_pressure: 30,
            step_seconds: 1.0 / 60.0,
            player_profile: PlayerProfileId::Idle,
            max_decisions_per_run: 16,
            learned_model_dir: None,
        }
    }

    pub fn reset(&mut self, seed_offset: u32) {
        self.account = AccountSnapshot::default();
        self.run_index = 0;
        self.seed_offset = seed_offset;
    }

    pub fn available_purchases(&self) -> Vec<String> {
        let mut ids = Vec::new();
        for meta in &self.bundle.meta_upgrades {
            if can_purchase(&self.account, meta).is_ok() {
                ids.push(meta.id.clone());
            }
        }
        ids
    }

    pub fn step(&mut self, action: MetaAction) -> StepResult {
        match action {
            MetaAction::Purchase(id) => {
                let meta = self.bundle.meta_upgrades.iter().find(|m| m.id == id);
                let Some(meta) = meta else {
                    return StepResult {
                        reward: 0.0,
                        done: false,
                        kind: StepKind::Failed(PurchaseError::Locked),
                        crystals_after: self.account.crystals,
                        final_pressure: None,
                    };
                };
                match purchase(&mut self.account, meta) {
                    Ok(cost) => StepResult {
                        reward: 0.0,
                        done: false,
                        kind: StepKind::Purchase {
                            upgrade_id: meta.id.clone(),
                            cost,
                        },
                        crystals_after: self.account.crystals,
                        final_pressure: None,
                    },
                    Err(err) => StepResult {
                        reward: 0.0,
                        done: false,
                        kind: StepKind::Failed(err),
                        crystals_after: self.account.crystals,
                        final_pressure: None,
                    },
                }
            }
            MetaAction::NextRun => self.run_one_trial(),
        }
    }

    fn run_one_trial(&mut self) -> StepResult {
        // Seed each run deterministically based on offset + run_index.
        let seed = self
            .seed_offset
            .wrapping_mul(0x9E3779B1)
            .wrapping_add(self.run_index.wrapping_mul(0x85ebca77))
            .wrapping_add(0xC2B2AE35);
        if self.player_profile.is_active() {
            return self.run_active_trial(seed);
        }

        let config = SimConfig {
            seed,
            start_stage: self.account.selected_start_stage.max(1),
            max_seconds: self.max_seconds,
            max_pressure: self.max_pressure,
            step_seconds: self.step_seconds,
        };
        let mut sim = Sim::new(self.bundle, config);
        // Apply selected character/weapon effects to the player.
        if let Some(character) = self
            .bundle
            .characters
            .iter()
            .find(|c| c.id == self.account.selected_character_id)
        {
            run_effects(
                &character.effects,
                1.0,
                &sim.balance.clone(),
                &mut sim.player,
            );
        }
        if let Some(weapon) = self
            .bundle
            .weapons
            .iter()
            .find(|w| w.id == self.account.selected_weapon_id)
        {
            run_effects(&weapon.effects, 1.0, &sim.balance.clone(), &mut sim.player);
        }

        sim.run_until(self.max_seconds, self.max_pressure, self.step_seconds);

        let died = sim.state.mode == GameMode::Gameover;
        let final_pressure = sim.state.pressure;
        let score = sim.state.score.max(0.0) as u64;
        let boss_stages = sim.state.run_boss_stages.clone();
        let profile = ProfileRunSummary {
            elapsed_seconds: sim.state.run_elapsed_seconds,
            run_level: sim.state.level,
            final_pressure,
            score,
            boss_stages: boss_stages.clone(),
            died,
            upgrade_offers: Default::default(),
            upgrade_picks: Default::default(),
            relic_offers: Default::default(),
            relic_picks: Default::default(),
            boss_spawn_stats: None,
            final_stats: RunStatSnapshot {
                hp: sim.player.hp,
                max_hp: sim.player.max_hp,
                damage: sim.player.damage,
                fire_rate: sim.player.fire_rate,
                projectile_count: sim.player.projectile_count,
                pierce: sim.player.pierce,
                drones: sim.player.drones,
                shield: sim.player.shield,
                shield_max: sim.player.shield_max,
                crit_chance: sim.player.crit_chance,
                pickup_radius: sim.player.pickup_radius,
                bullet_radius: sim.player.bullet_radius,
                speed: sim.player.speed,
            },
        };

        let outcome = RunOutcome {
            elapsed_seconds: sim.state.run_elapsed_seconds,
            run_level: sim.state.level,
            score,
            boss_stages: boss_stages.clone(),
            start_stage: self.account.selected_start_stage,
            died,
        };
        let _crystals_before = self.account.crystals;
        apply_run_reward(&mut self.account, &outcome);
        let reward = (final_pressure as f64) - (current_rarity_rank(&self.account) as f64) * 0.1;
        self.run_index += 1;

        StepResult {
            reward,
            done: false,
            kind: StepKind::Run {
                pressure: final_pressure,
                score,
                boss_stages,
                died,
                profile,
            },
            crystals_after: self.account.crystals,
            final_pressure: Some(final_pressure),
        }
    }

    fn run_active_trial(&mut self, seed: u32) -> StepResult {
        let profile = match run_active_profile_trial(
            self.bundle,
            &self.account,
            self.player_profile.clone(),
            ActiveRunOptions {
                seed,
                max_seconds: self.max_seconds,
                max_pressure: self.max_pressure,
                step_seconds: self.step_seconds,
                max_decisions_per_run: self.max_decisions_per_run,
                learned_model_dir: self.learned_model_dir.clone(),
            },
        ) {
            Ok(profile) => profile,
            Err(err) => {
                return StepResult {
                    reward: 0.0,
                    done: true,
                    kind: StepKind::PolicyFailed(err.to_string()),
                    crystals_after: self.account.crystals,
                    final_pressure: None,
                };
            }
        };
        let final_pressure = profile.final_pressure;
        let outcome = RunOutcome {
            elapsed_seconds: profile.elapsed_seconds,
            run_level: profile.run_level,
            score: profile.score,
            boss_stages: profile.boss_stages.clone(),
            start_stage: self.account.selected_start_stage,
            died: profile.died,
        };
        apply_run_reward(&mut self.account, &outcome);
        let reward = (final_pressure as f64) - (current_rarity_rank(&self.account) as f64) * 0.1;
        self.run_index += 1;

        StepResult {
            reward,
            done: false,
            kind: StepKind::Run {
                pressure: final_pressure,
                score: profile.score,
                boss_stages: profile.boss_stages.clone(),
                died: profile.died,
                profile,
            },
            crystals_after: self.account.crystals,
            final_pressure: Some(final_pressure),
        }
    }
}

#[cfg(test)]
mod tests {
    use voidline_data::load_default;

    use crate::profiles::PlayerProfileId;

    use super::{MetaAction, MetaProgressionEnv, StepKind};

    #[test]
    fn policy_load_failure_is_terminal() {
        let bundle = load_default().unwrap();
        let mut env = MetaProgressionEnv::new(&bundle, 0);
        env.player_profile = PlayerProfileId::LearnedHuman;
        env.learned_model_dir = Some(std::env::temp_dir().join("voidline-missing-env-models"));

        let result = env.step(MetaAction::NextRun);

        assert!(result.done);
        assert!(matches!(result.kind, StepKind::PolicyFailed(_)));
        assert_eq!(env.run_index, 0);
    }
}
