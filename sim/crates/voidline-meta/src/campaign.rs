//! Run a campaign of N runs with a given policy and capture the timeline
//! (which meta-upgrade was unlocked at which run, what pressure each run reached).

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use voidline_data::DataBundle;

use crate::account::AccountSnapshot;
use crate::env::{MetaAction, MetaProgressionEnv, StepKind, StepResult};
use crate::policies::{MetaPolicy, PolicyId};
use crate::profiles::{PlayerProfileId, ProfileRunSummary};

#[derive(Debug, Clone)]
pub struct CampaignTimelineEntry {
    pub run_index: u32,
    pub action: String,
    pub crystals_before: u64,
    pub crystals_after: u64,
    pub pressure_reached: Option<u32>,
    pub purchased: Option<String>,
    pub died: Option<bool>,
    pub profile: Option<ProfileRunSummary>,
}

#[derive(Debug, Clone)]
pub struct CampaignResult {
    pub policy: PolicyId,
    pub seed: u32,
    pub timeline: Vec<CampaignTimelineEntry>,
    pub unlock_run_index: HashMap<String, u32>,
    pub first_stage1_clear: Option<u32>,
    pub first_stage2_clear: Option<u32>,
    pub first_stage3_clear: Option<u32>,
    pub first_boss_kill: Option<u32>,
    pub final_crystals: u64,
    pub final_run_index: u32,
    pub initial_run_index: u32,
    pub stage1_checkpoint: Option<CampaignCheckpoint>,
    pub stage2_checkpoint: Option<CampaignCheckpoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CampaignCheckpoint {
    pub checkpoint_stage: u32,
    pub campaign_index: u32,
    pub seed: u32,
    pub run_index: u32,
    pub account: AccountSnapshot,
    pub unlock_run_index: HashMap<String, u32>,
}

#[derive(Debug, Clone)]
pub struct CampaignOptions {
    pub seed: u32,
    pub campaign_index: u32,
    pub runs_count: u32,
    pub max_seconds: f64,
    pub max_pressure: u32,
    pub step_seconds: f64,
    pub max_decisions_per_run: u32,
    pub player_profile: PlayerProfileId,
    pub initial_account: Option<AccountSnapshot>,
    pub initial_run_index: u32,
    pub initial_unlock_run_index: HashMap<String, u32>,
}

impl Default for CampaignOptions {
    fn default() -> Self {
        Self {
            seed: 0,
            campaign_index: 0,
            runs_count: 30,
            max_seconds: 240.0,
            max_pressure: 30,
            step_seconds: 1.0 / 60.0,
            max_decisions_per_run: 16,
            player_profile: PlayerProfileId::Idle,
            initial_account: None,
            initial_run_index: 0,
            initial_unlock_run_index: HashMap::new(),
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
    env.max_pressure = options.max_pressure;
    env.step_seconds = options.step_seconds;
    env.player_profile = options.player_profile;
    env.max_decisions_per_run = options.max_decisions_per_run;
    if let Some(account) = options.initial_account.clone() {
        env.account = account;
    }
    env.run_index = options.initial_run_index;

    let mut timeline = Vec::new();
    let mut unlock_run_index: HashMap<String, u32> = options.initial_unlock_run_index.clone();
    let mut first_stage1_clear: Option<u32> = if env.account.highest_stage_cleared >= 1 {
        Some(options.initial_run_index)
    } else {
        None
    };
    let mut first_stage2_clear: Option<u32> = if env.account.highest_stage_cleared >= 2 {
        Some(options.initial_run_index)
    } else {
        None
    };
    let mut first_stage3_clear: Option<u32> = if env.account.highest_stage_cleared >= 3 {
        Some(options.initial_run_index)
    } else {
        None
    };
    let mut first_boss_kill: Option<u32> = None;
    let mut stage1_checkpoint: Option<CampaignCheckpoint> = None;
    let mut stage2_checkpoint: Option<CampaignCheckpoint> = None;

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
                        pressure_reached: None,
                        purchased: Some(upgrade_id.clone()),
                        died: None,
                        profile: None,
                    });
                    unlock_run_index
                        .entry(upgrade_id.clone())
                        .or_insert(run_index);
                    decisions += 1;
                    if decisions >= options.max_decisions_per_run {
                        break;
                    }
                }
                StepKind::Run {
                    pressure,
                    died,
                    boss_stages,
                    profile,
                    ..
                } => {
                    if !boss_stages.is_empty() {
                        let human_run_index = run_index + 1;
                        first_boss_kill.get_or_insert(human_run_index);
                        for stage in boss_stages {
                            if *stage >= 1 {
                                first_stage1_clear.get_or_insert(human_run_index);
                                if stage1_checkpoint.is_none() {
                                    stage1_checkpoint = Some(checkpoint(
                                        1,
                                        &options,
                                        env.run_index,
                                        &env.account,
                                        &unlock_run_index,
                                    ));
                                }
                            }
                            if *stage >= 2 {
                                first_stage2_clear.get_or_insert(human_run_index);
                                if stage2_checkpoint.is_none() {
                                    stage2_checkpoint = Some(checkpoint(
                                        2,
                                        &options,
                                        env.run_index,
                                        &env.account,
                                        &unlock_run_index,
                                    ));
                                }
                            }
                            if *stage >= 3 {
                                first_stage3_clear.get_or_insert(human_run_index);
                            }
                        }
                    }
                    timeline.push(CampaignTimelineEntry {
                        run_index,
                        action: "run".to_string(),
                        crystals_before,
                        crystals_after: result.crystals_after,
                        pressure_reached: Some(*pressure),
                        purchased: None,
                        died: Some(*died),
                        profile: Some(profile.clone()),
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
        first_stage3_clear,
        first_boss_kill,
        final_crystals: env.account.crystals,
        final_run_index: env.run_index,
        initial_run_index: options.initial_run_index,
        stage1_checkpoint,
        stage2_checkpoint,
    }
}

fn checkpoint(
    checkpoint_stage: u32,
    options: &CampaignOptions,
    run_index: u32,
    account: &AccountSnapshot,
    unlock_run_index: &HashMap<String, u32>,
) -> CampaignCheckpoint {
    CampaignCheckpoint {
        checkpoint_stage,
        campaign_index: options.campaign_index,
        seed: options.seed,
        run_index,
        account: account.clone(),
        unlock_run_index: unlock_run_index.clone(),
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use voidline_data::load_default;

    use crate::account::AccountSnapshot;
    use crate::policies::FocusedAttackPolicy;

    use super::{run_meta_campaign, CampaignOptions};

    #[test]
    fn campaign_starts_from_initial_account_and_run_index() {
        let bundle = load_default().unwrap();
        let mut account = AccountSnapshot::default();
        account.crystals = 321;
        account.highest_stage_cleared = 3;
        account.highest_start_stage_unlocked = 3;
        account.selected_start_stage = 3;
        let options = CampaignOptions {
            runs_count: 0,
            initial_run_index: 50,
            initial_account: Some(account),
            initial_unlock_run_index: HashMap::from([("card:twin-cannon".to_string(), 12)]),
            ..CampaignOptions::default()
        };
        let mut policy = FocusedAttackPolicy::default();

        let result = run_meta_campaign(&bundle, options, &mut policy);

        assert_eq!(result.final_run_index, 50);
        assert_eq!(result.final_crystals, 321);
        assert_eq!(result.first_stage1_clear, Some(50));
        assert_eq!(result.first_stage2_clear, Some(50));
        assert_eq!(result.first_stage3_clear, Some(50));
        assert_eq!(result.unlock_run_index["card:twin-cannon"], 12);
    }

    #[test]
    fn campaign_starts_from_initial_run_index_without_account_snapshot() {
        let bundle = load_default().unwrap();
        let options = CampaignOptions {
            runs_count: 0,
            initial_run_index: 37,
            initial_account: None,
            ..CampaignOptions::default()
        };
        let mut policy = FocusedAttackPolicy::default();

        let result = run_meta_campaign(&bundle, options, &mut policy);

        assert_eq!(result.initial_run_index, 37);
        assert_eq!(result.final_run_index, 37);
        assert_eq!(result.first_stage1_clear, None);
    }
}
