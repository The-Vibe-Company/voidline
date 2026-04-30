//! Run a campaign of N runs with a given policy and capture the timeline
//! (which meta-upgrade was unlocked at which run, what wave each run reached).

use std::collections::HashMap;

use voidline_data::DataBundle;

use crate::env::{MetaAction, MetaProgressionEnv, StepKind, StepResult};
use crate::policies::{MetaPolicy, PolicyId};

#[derive(Debug, Clone)]
pub struct CampaignTimelineEntry {
    pub run_index: u32,
    pub action: String,
    pub crystals_before: u64,
    pub crystals_after: u64,
    pub wave_reached: Option<u32>,
    pub purchased: Option<String>,
    pub died: Option<bool>,
}

#[derive(Debug, Clone)]
pub struct CampaignResult {
    pub policy: PolicyId,
    pub seed: u32,
    pub timeline: Vec<CampaignTimelineEntry>,
    pub unlock_run_index: HashMap<String, u32>,
    pub first_stage1_clear: Option<u32>,
    pub first_stage2_clear: Option<u32>,
    pub first_boss_kill: Option<u32>,
    pub final_crystals: u64,
    pub final_run_index: u32,
}

#[derive(Debug, Clone, Copy)]
pub struct CampaignOptions {
    pub seed: u32,
    pub runs_count: u32,
    pub max_seconds: f64,
    pub max_wave: u32,
    pub step_seconds: f64,
    pub max_decisions_per_run: u32,
}

impl Default for CampaignOptions {
    fn default() -> Self {
        Self {
            seed: 0,
            runs_count: 30,
            max_seconds: 45.0,
            max_wave: 6,
            step_seconds: 1.0 / 60.0,
            max_decisions_per_run: 16,
        }
    }
}

pub fn run_meta_campaign<P: MetaPolicy>(
    bundle: &DataBundle,
    options: CampaignOptions,
    policy: &mut P,
) -> CampaignResult {
    let mut env = MetaProgressionEnv::new(bundle, options.seed);
    env.max_seconds = options.max_seconds;
    env.max_wave = options.max_wave;
    env.step_seconds = options.step_seconds;

    let mut timeline = Vec::new();
    let mut unlock_run_index: HashMap<String, u32> = HashMap::new();
    let mut first_stage1_clear: Option<u32> = None;
    let mut first_stage2_clear: Option<u32> = None;
    let mut first_boss_kill: Option<u32> = None;

    let mut runs_done: u32 = 0;
    while runs_done < options.runs_count {
        // Allow up to N purchase decisions before forcing a run.
        let mut decisions = 0;
        loop {
            let crystals_before = env.account.crystals;
            let run_index = env.run_index;
            let action = policy.pick(&env);
            let force_run = matches!(action, MetaAction::NextRun);
            let result: StepResult = env.step(action);

            match &result.kind {
                StepKind::Purchase { upgrade_id, .. } => {
                    timeline.push(CampaignTimelineEntry {
                        run_index,
                        action: format!("buy:{upgrade_id}"),
                        crystals_before,
                        crystals_after: result.crystals_after,
                        wave_reached: None,
                        purchased: Some(upgrade_id.clone()),
                        died: None,
                    });
                    unlock_run_index
                        .entry(upgrade_id.clone())
                        .or_insert(run_index);
                    decisions += 1;
                    if decisions >= options.max_decisions_per_run {
                        break;
                    }
                }
                StepKind::Run { wave, died, boss_stages, .. } => {
                    if !boss_stages.is_empty() {
                        first_boss_kill.get_or_insert(run_index);
                        for stage in boss_stages {
                            if *stage >= 1 {
                                first_stage1_clear.get_or_insert(run_index);
                            }
                            if *stage >= 2 {
                                first_stage2_clear.get_or_insert(run_index);
                            }
                        }
                    }
                    timeline.push(CampaignTimelineEntry {
                        run_index,
                        action: "run".to_string(),
                        crystals_before,
                        crystals_after: result.crystals_after,
                        wave_reached: Some(*wave),
                        purchased: None,
                        died: Some(*died),
                    });
                    runs_done += 1;
                    break;
                }
                StepKind::Failed(_) => {
                    if force_run {
                        // shouldn't happen — NextRun never fails
                    }
                    break;
                }
            }
        }
    }

    CampaignResult {
        policy: policy.id(),
        seed: options.seed,
        timeline,
        unlock_run_index,
        first_stage1_clear,
        first_stage2_clear,
        first_boss_kill,
        final_crystals: env.account.crystals,
        final_run_index: env.run_index,
    }
}
