//! ONNX-backed run policy for learned RL personas.

use std::path::Path;

use tract_onnx::prelude::*;
use voidline_data::DataBundle;
use voidline_sim::engine::{EngineSnapshot, RelicChoiceRecord, UpgradeChoiceRecord};

use crate::obs::{
    action_from_logits, action_mask, encode_observation, movement_keys, ActionMask, RlAction,
    ACTION_LOGITS, OBS_VECTOR_DIM,
};
use crate::profiles::{RunPolicy, RunPolicyError};

type RunnableOnnx = SimplePlan<TypedFact, Box<dyn TypedOp>, Graph<TypedFact, Box<dyn TypedOp>>>;

pub struct LearnedPolicy {
    model: RunnableOnnx,
}

impl LearnedPolicy {
    pub fn load(persona: impl Into<String>, path: &Path) -> Result<Self, RunPolicyError> {
        if !path.exists() {
            return Err(RunPolicyError::MissingModel {
                profile: persona.into(),
                path: path.to_path_buf(),
            });
        }
        let persona = persona.into();
        let model = tract_onnx::onnx()
            .model_for_path(path)
            .map_err(|err| RunPolicyError::ModelLoad {
                profile: persona.clone(),
                path: path.to_path_buf(),
                message: err.to_string(),
            })?
            .with_input_fact(0, f32::fact([1, OBS_VECTOR_DIM]).into())
            .map_err(|err| RunPolicyError::ModelLoad {
                profile: persona.clone(),
                path: path.to_path_buf(),
                message: err.to_string(),
            })?
            .into_optimized()
            .map_err(|err| RunPolicyError::ModelLoad {
                profile: persona.clone(),
                path: path.to_path_buf(),
                message: err.to_string(),
            })?
            .into_runnable()
            .map_err(|err| RunPolicyError::ModelLoad {
                profile: persona.clone(),
                path: path.to_path_buf(),
                message: err.to_string(),
            })?;
        Ok(Self { model })
    }

    fn action(
        &mut self,
        bundle: &DataBundle,
        snapshot: &EngineSnapshot,
        upgrade_choices: &[UpgradeChoiceRecord],
        relic_choices: &[RelicChoiceRecord],
    ) -> RlAction {
        let mask = action_mask(snapshot, upgrade_choices, relic_choices);
        match self.logits(bundle, snapshot, upgrade_choices, relic_choices) {
            Ok(logits) => action_from_logits(&logits, &mask),
            Err(_) => fallback_action(&mask),
        }
    }

    fn logits(
        &mut self,
        bundle: &DataBundle,
        snapshot: &EngineSnapshot,
        upgrade_choices: &[UpgradeChoiceRecord],
        relic_choices: &[RelicChoiceRecord],
    ) -> TractResult<Vec<f32>> {
        let obs = encode_observation(bundle, snapshot, upgrade_choices, relic_choices).flatten();
        let input = Tensor::from_shape(&[1, OBS_VECTOR_DIM], &obs)?;
        let outputs = self.model.run(tvec!(input.into()))?;
        let Some(first) = outputs.first() else {
            return Ok(vec![0.0; ACTION_LOGITS]);
        };
        let view = first.to_array_view::<f32>()?;
        let mut logits = view.iter().copied().collect::<Vec<_>>();
        logits.resize(ACTION_LOGITS, 0.0);
        Ok(logits)
    }
}

impl RunPolicy for LearnedPolicy {
    fn movement_keys(&mut self, bundle: &DataBundle, snapshot: &EngineSnapshot) -> Vec<String> {
        let action = self.action(bundle, snapshot, &[], &[]);
        movement_keys(action.movement)
    }

    fn choose_upgrade(
        &mut self,
        bundle: &DataBundle,
        snapshot: &EngineSnapshot,
        choices: &[UpgradeChoiceRecord],
    ) -> Option<UpgradeChoiceRecord> {
        let action = self.action(bundle, snapshot, choices, &[]);
        action
            .upgrade_pick
            .checked_sub(1)
            .and_then(|idx| choices.get(idx))
            .cloned()
    }

    fn choose_relic(
        &mut self,
        bundle: &DataBundle,
        snapshot: &EngineSnapshot,
        choices: &[RelicChoiceRecord],
    ) -> Option<RelicChoiceRecord> {
        let action = self.action(bundle, snapshot, &[], choices);
        action
            .relic_pick
            .checked_sub(1)
            .and_then(|idx| choices.get(idx))
            .cloned()
    }
}

fn fallback_action(mask: &ActionMask) -> RlAction {
    RlAction {
        movement: mask.movement.iter().position(|value| *value).unwrap_or(0),
        upgrade_pick: mask
            .upgrade_pick
            .iter()
            .position(|value| *value)
            .unwrap_or(0),
        relic_pick: mask.relic_pick.iter().position(|value| *value).unwrap_or(0),
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;

    #[test]
    fn missing_model_path_returns_structured_error() {
        let path = PathBuf::from(".context/rl-models/does-not-exist.onnx");
        let err = match LearnedPolicy::load("learned-human", &path) {
            Ok(_) => panic!("missing model should fail"),
            Err(err) => err,
        };

        assert!(matches!(err, RunPolicyError::MissingModel { .. }));
        assert!(err.to_string().contains("learned-human"));
    }
}
