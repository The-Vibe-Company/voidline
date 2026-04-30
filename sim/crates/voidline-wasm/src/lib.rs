use wasm_bindgen::prelude::*;

use voidline_data::DataBundle;
use voidline_meta::account::{
    apply_run_reward, compute_run_breakdown, AccountRecords, AccountSnapshot, RunOutcome,
};
use voidline_sim::engine::{
    Engine, EngineAccountContext, EngineConfig, EngineInput, RelicChoiceRecord, StressSeedConfig,
    UpgradeChoiceRecord,
};

use serde::{Deserialize, Serialize};

#[wasm_bindgen]
pub struct WasmEngine {
    inner: Engine,
}

#[wasm_bindgen]
impl WasmEngine {
    #[wasm_bindgen(constructor)]
    pub fn new(balance_json: &str, config: JsValue) -> Result<WasmEngine, JsValue> {
        let bundle: DataBundle = serde_json::from_str(balance_json)
            .map_err(|err| JsValue::from_str(&format!("balance.json parse failed: {err}")))?;
        let config: EngineConfig = if config.is_undefined() || config.is_null() {
            EngineConfig::default()
        } else {
            serde_wasm_bindgen::from_value(config)
                .map_err(|err| JsValue::from_str(&format!("engine config parse failed: {err}")))?
        };
        Ok(Self {
            inner: Engine::new(bundle, config),
        })
    }

    #[wasm_bindgen(js_name = reset)]
    pub fn reset(&mut self, seed: Option<u32>, account: JsValue) -> Result<(), JsValue> {
        let account = if account.is_undefined() || account.is_null() {
            None
        } else {
            Some(
                serde_wasm_bindgen::from_value::<EngineAccountContext>(account).map_err(|err| {
                    JsValue::from_str(&format!("account context parse failed: {err}"))
                })?,
            )
        };
        self.inner.reset(seed, account);
        Ok(())
    }

    #[wasm_bindgen(js_name = updateAccount)]
    pub fn update_account(&mut self, account: JsValue) -> Result<(), JsValue> {
        let account = serde_wasm_bindgen::from_value::<EngineAccountContext>(account)
            .map_err(|err| JsValue::from_str(&format!("account context parse failed: {err}")))?;
        self.inner.update_account(account);
        Ok(())
    }

    #[wasm_bindgen(js_name = resize)]
    pub fn resize(&mut self, width: f64, height: f64, dpr: f64) {
        self.inner.resize(width, height, dpr);
    }

    #[wasm_bindgen(js_name = setInput)]
    pub fn set_input(&mut self, input: JsValue) -> Result<(), JsValue> {
        let input = serde_wasm_bindgen::from_value::<EngineInput>(input)
            .map_err(|err| JsValue::from_str(&format!("input parse failed: {err}")))?;
        self.inner.set_input(input);
        Ok(())
    }

    #[wasm_bindgen(js_name = step)]
    pub fn step(&mut self, dt: f64) {
        self.inner.step(dt);
    }

    #[wasm_bindgen(js_name = seedStress)]
    pub fn seed_stress(&mut self, config: JsValue) -> Result<(), JsValue> {
        let config = serde_wasm_bindgen::from_value::<StressSeedConfig>(config)
            .map_err(|err| JsValue::from_str(&format!("stress config parse failed: {err}")))?;
        self.inner.seed_stress(config);
        Ok(())
    }

    #[wasm_bindgen(js_name = snapshot)]
    pub fn snapshot(&self) -> Result<JsValue, JsValue> {
        to_json_value(&self.inner.snapshot(), "snapshot serialize failed")
    }

    #[wasm_bindgen(js_name = draftUpgrades)]
    pub fn draft_upgrades(&mut self, count: u32) -> Result<JsValue, JsValue> {
        let choices: Vec<UpgradeChoiceRecord> = self.inner.draft_upgrades(count);
        to_json_value(&choices, "upgrade choices serialize failed")
    }

    #[wasm_bindgen(js_name = applyUpgrade)]
    pub fn apply_upgrade(&mut self, upgrade_id: &str, tier_id: &str) -> Result<(), JsValue> {
        self.inner
            .apply_upgrade(upgrade_id, tier_id)
            .map_err(|err| JsValue::from_str(&err))
    }

    #[wasm_bindgen(js_name = draftRelics)]
    pub fn draft_relics(&mut self, count: u32) -> Result<JsValue, JsValue> {
        let choices: Vec<RelicChoiceRecord> = self.inner.draft_relics(count);
        to_json_value(&choices, "relic choices serialize failed")
    }

    #[wasm_bindgen(js_name = applyRelic)]
    pub fn apply_relic(&mut self, relic_id: &str) -> Result<(), JsValue> {
        self.inner
            .apply_relic(relic_id)
            .map_err(|err| JsValue::from_str(&err))
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserAccountProgress {
    pub crystals: u64,
    pub spent_crystals: u64,
    pub upgrade_levels: std::collections::HashMap<String, u32>,
    pub selected_character_id: String,
    pub selected_weapon_id: String,
    pub selected_start_stage: u32,
    pub highest_stage_cleared: u32,
    pub highest_start_stage_unlocked: u32,
    pub records: BrowserAccountRecords,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserAccountRecords {
    pub best_stage: u32,
    pub best_time_seconds: u32,
    pub best_score: u32,
    pub best_run_level: u32,
    pub boss_kills: u32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserRunSummary {
    pub stage: u32,
    pub start_stage: u32,
    pub elapsed_seconds: f64,
    pub run_level: u32,
    pub score: u64,
    pub boss_stages: Vec<u32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserRewardResult {
    pub progress: BrowserAccountProgressOut,
    pub reward: BrowserAccountReward,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserAccountProgressOut {
    pub crystals: u64,
    pub spent_crystals: u64,
    pub upgrade_levels: std::collections::HashMap<String, u32>,
    pub selected_character_id: String,
    pub selected_weapon_id: String,
    pub selected_start_stage: u32,
    pub highest_stage_cleared: u32,
    pub highest_start_stage_unlocked: u32,
    pub records: BrowserAccountRecordsOut,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserAccountRecordsOut {
    pub best_stage: u32,
    pub best_time_seconds: u32,
    pub best_score: u32,
    pub best_run_level: u32,
    pub boss_kills: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserAccountReward {
    pub source: String,
    pub crystals_gained: u64,
    pub newly_unlocked_start_stage: Option<u32>,
    pub new_records: Vec<String>,
    pub breakdown: BrowserRewardBreakdown,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserRewardBreakdown {
    pub duration_crystals: u64,
    pub stage_crystals: u64,
    pub boss_crystals: u64,
    pub score_crystals: u64,
    pub record_crystals: u64,
    pub start_stage_bonus_crystals: u64,
}

#[wasm_bindgen(js_name = applyRunReward)]
pub fn apply_run_reward_js(progress: JsValue, summary: JsValue) -> Result<JsValue, JsValue> {
    let progress = serde_wasm_bindgen::from_value::<BrowserAccountProgress>(progress)
        .map_err(|err| JsValue::from_str(&format!("account progress parse failed: {err}")))?;
    let summary = serde_wasm_bindgen::from_value::<BrowserRunSummary>(summary)
        .map_err(|err| JsValue::from_str(&format!("run summary parse failed: {err}")))?;

    let mut account = AccountSnapshot {
        crystals: progress.crystals,
        spent_crystals: progress.spent_crystals,
        upgrade_levels: progress.upgrade_levels,
        selected_character_id: progress.selected_character_id,
        selected_weapon_id: progress.selected_weapon_id,
        selected_start_stage: progress.selected_start_stage,
        highest_stage_cleared: progress.highest_stage_cleared,
        highest_start_stage_unlocked: progress.highest_start_stage_unlocked,
        records: AccountRecords {
            best_stage: progress.records.best_stage,
            best_time_seconds: progress.records.best_time_seconds,
            best_score: progress.records.best_score,
            best_run_level: progress.records.best_run_level,
            boss_kills: progress.records.boss_kills,
        },
    };
    let previous_start_stage = account.highest_start_stage_unlocked;
    let previous_records = account.records.clone();
    let outcome = RunOutcome {
        elapsed_seconds: summary.elapsed_seconds,
        run_level: summary.run_level,
        score: summary.score,
        boss_stages: summary.boss_stages,
        start_stage: summary.start_stage,
        died: false,
    };
    let breakdown = compute_run_breakdown(&account, &outcome);
    let crystals_gained = apply_run_reward(&mut account, &outcome);
    let reward = BrowserAccountReward {
        source: "run".to_string(),
        crystals_gained,
        newly_unlocked_start_stage: (account.highest_start_stage_unlocked > previous_start_stage)
            .then_some(account.highest_start_stage_unlocked),
        new_records: changed_records(&previous_records, &account.records),
        breakdown: BrowserRewardBreakdown {
            duration_crystals: breakdown.duration,
            stage_crystals: breakdown.stage,
            boss_crystals: breakdown.boss,
            score_crystals: breakdown.score,
            record_crystals: breakdown.record,
            start_stage_bonus_crystals: breakdown.start_stage_bonus,
        },
    };
    let result = BrowserRewardResult {
        progress: BrowserAccountProgressOut {
            crystals: account.crystals,
            spent_crystals: account.spent_crystals,
            upgrade_levels: account.upgrade_levels,
            selected_character_id: account.selected_character_id,
            selected_weapon_id: account.selected_weapon_id,
            selected_start_stage: account.selected_start_stage,
            highest_stage_cleared: account.highest_stage_cleared,
            highest_start_stage_unlocked: account.highest_start_stage_unlocked,
            records: BrowserAccountRecordsOut {
                best_stage: account.records.best_stage,
                best_time_seconds: account.records.best_time_seconds,
                best_score: account.records.best_score,
                best_run_level: account.records.best_run_level,
                boss_kills: account.records.boss_kills,
            },
        },
        reward,
    };
    to_json_value(&result, "reward serialize failed")
}

fn to_json_value<T: Serialize>(value: &T, context: &str) -> Result<JsValue, JsValue> {
    value
        .serialize(&serde_wasm_bindgen::Serializer::json_compatible())
        .map_err(|err| JsValue::from_str(&format!("{context}: {err}")))
}

fn changed_records(previous: &AccountRecords, next: &AccountRecords) -> Vec<String> {
    let mut records = Vec::new();
    if next.best_stage > previous.best_stage {
        records.push("stage".to_string());
    }
    if next.best_time_seconds > previous.best_time_seconds {
        records.push("temps".to_string());
    }
    if next.best_score > previous.best_score {
        records.push("score".to_string());
    }
    if next.best_run_level > previous.best_run_level {
        records.push("niveau".to_string());
    }
    records
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn browser_reward_uses_stage_summary_shape() {
        let progress = BrowserAccountProgress {
            crystals: 0,
            spent_crystals: 0,
            upgrade_levels: std::collections::HashMap::new(),
            selected_character_id: "pilot".to_string(),
            selected_weapon_id: "pulse".to_string(),
            selected_start_stage: 1,
            highest_stage_cleared: 0,
            highest_start_stage_unlocked: 1,
            records: BrowserAccountRecords {
                best_stage: 1,
                best_time_seconds: 0,
                best_score: 0,
                best_run_level: 1,
                boss_kills: 0,
            },
        };
        let summary = BrowserRunSummary {
            stage: 2,
            start_stage: 1,
            elapsed_seconds: 120.0,
            run_level: 4,
            score: 10_000,
            boss_stages: vec![1],
        };
        let mut account = AccountSnapshot {
            crystals: progress.crystals,
            spent_crystals: progress.spent_crystals,
            upgrade_levels: progress.upgrade_levels,
            selected_character_id: progress.selected_character_id,
            selected_weapon_id: progress.selected_weapon_id,
            selected_start_stage: progress.selected_start_stage,
            highest_stage_cleared: progress.highest_stage_cleared,
            highest_start_stage_unlocked: progress.highest_start_stage_unlocked,
            records: AccountRecords {
                best_stage: progress.records.best_stage,
                best_time_seconds: progress.records.best_time_seconds,
                best_score: progress.records.best_score,
                best_run_level: progress.records.best_run_level,
                boss_kills: progress.records.boss_kills,
            },
        };
        let outcome = RunOutcome {
            elapsed_seconds: summary.elapsed_seconds,
            run_level: summary.run_level,
            score: summary.score,
            boss_stages: summary.boss_stages,
            start_stage: summary.start_stage,
            died: false,
        };
        let breakdown = compute_run_breakdown(&account, &outcome);
        let gained = apply_run_reward(&mut account, &outcome);

        assert_eq!(breakdown.duration, 10);
        assert_eq!(breakdown.stage, 30);
        assert_eq!(breakdown.boss, 45);
        assert_eq!(breakdown.score, 8);
        assert_eq!(breakdown.record, 73);
        assert_eq!(gained, 166);
        assert_eq!(account.highest_start_stage_unlocked, 2);
    }
}
