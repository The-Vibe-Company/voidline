//! `MetaProgressionEnv` — Gym-like API exposing meta-progression state +
//! actions to a policy. Each `step` either purchases a meta-upgrade or
//! runs one trial via `voidline_sim::Sim`.

use voidline_data::DataBundle;

use voidline_sim::effects::run_effects;
use voidline_sim::simulation::{Sim, SimConfig};
use voidline_sim::state::GameMode;

use crate::account::{
    apply_run_reward, can_purchase, current_rarity_rank, purchase, AccountSnapshot, PurchaseError,
    RunOutcome,
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
    pub final_wave: Option<u32>,
}

#[derive(Debug, Clone)]
pub enum StepKind {
    Purchase {
        upgrade_id: String,
        cost: u64,
    },
    Run {
        wave: u32,
        score: u64,
        boss_stages: Vec<u32>,
        died: bool,
    },
    Failed(PurchaseError),
}

pub struct MetaProgressionEnv<'a> {
    pub bundle: &'a DataBundle,
    pub account: AccountSnapshot,
    pub run_index: u32,
    pub seed_offset: u32,
    pub max_seconds: f64,
    pub max_wave: u32,
    pub step_seconds: f64,
}

impl<'a> MetaProgressionEnv<'a> {
    pub fn new(bundle: &'a DataBundle, seed_offset: u32) -> Self {
        Self {
            bundle,
            account: AccountSnapshot::default(),
            run_index: 0,
            seed_offset,
            max_seconds: 90.0,
            max_wave: 6,
            step_seconds: 1.0 / 60.0,
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
                        final_wave: None,
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
                        final_wave: None,
                    },
                    Err(err) => StepResult {
                        reward: 0.0,
                        done: false,
                        kind: StepKind::Failed(err),
                        crystals_after: self.account.crystals,
                        final_wave: None,
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
        let config = SimConfig {
            seed,
            start_stage: self.account.selected_start_stage.max(1),
            max_seconds: self.max_seconds,
            max_wave: self.max_wave,
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
            run_effects(&character.effects, 1.0, &sim.balance.clone(), &mut sim.player);
        }
        if let Some(weapon) = self
            .bundle
            .weapons
            .iter()
            .find(|w| w.id == self.account.selected_weapon_id)
        {
            run_effects(&weapon.effects, 1.0, &sim.balance.clone(), &mut sim.player);
        }

        sim.run_until(self.max_seconds, self.max_wave, self.step_seconds);

        let died = sim.state.mode == GameMode::Gameover;
        let final_wave = sim.state.wave;
        let score = sim.state.score.max(0.0) as u64;
        let boss_stages = sim.state.run_boss_stages.clone();

        let outcome = RunOutcome {
            final_wave,
            elapsed_seconds: sim.state.run_elapsed_seconds,
            run_level: sim.state.level,
            score,
            boss_stages: boss_stages.clone(),
            start_stage: self.account.selected_start_stage,
            died,
        };
        let crystals_before = self.account.crystals;
        apply_run_reward(&mut self.account, &outcome);
        let reward = (final_wave as f64) - (current_rarity_rank(&self.account) as f64) * 0.1;
        self.run_index += 1;

        StepResult {
            reward,
            done: false,
            kind: StepKind::Run {
                wave: final_wave,
                score,
                boss_stages,
                died,
            },
            crystals_after: self.account.crystals,
            final_wave: Some(final_wave),
        }
    }
}
