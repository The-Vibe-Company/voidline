//! Python bindings for RL training and evaluation.
#![cfg_attr(not(feature = "extension-module"), allow(dead_code, unused_imports))]

#[cfg(feature = "extension-module")]
use pyo3::prelude::*;
#[cfg(feature = "extension-module")]
use pyo3::types::PyDict;
#[cfg(feature = "extension-module")]
use rayon::prelude::*;
use voidline_data::{load_default, DataBundle};
use voidline_meta::obs::{
    action_mask, encode_observation, movement_keys, ActionMask, EncodedObservation, RlAction,
    ACTION_LOGITS, OBS_VECTOR_DIM,
};
use voidline_meta::profiles::engine_account_context;
use voidline_meta::AccountSnapshot;
use voidline_sim::engine::{
    Engine, EngineConfig, EngineInput, RelicChoiceRecord, UpgradeChoiceRecord,
};

#[derive(Debug, Clone)]
struct StepOutput {
    obs: EncodedObservation,
    reward: f64,
    terminated: bool,
    truncated: bool,
    info: StepInfo,
}

#[derive(Debug, Clone, Default)]
struct StepInfo {
    score: f64,
    pressure: u32,
    level: u32,
    elapsed_seconds: f64,
    death: bool,
    terminal_observation: Option<EncodedObservation>,
}

struct EpisodeEnv {
    bundle: DataBundle,
    engine: Engine,
    seed: u32,
    episode_index: u32,
    step_count: u32,
    max_steps: u32,
    last_score: f64,
    current_upgrades: Vec<UpgradeChoiceRecord>,
    current_relics: Vec<RelicChoiceRecord>,
}

impl EpisodeEnv {
    fn new(seed: u32, max_steps: u32) -> Result<Self, String> {
        let bundle = load_default().map_err(|err| err.to_string())?;
        let account = engine_account_context(&bundle, &AccountSnapshot::default());
        let engine = Engine::new(
            bundle.clone(),
            EngineConfig {
                seed: Some(seed),
                width: None,
                height: None,
                dpr: None,
                account: Some(account),
            },
        );
        Ok(Self {
            bundle,
            engine,
            seed,
            episode_index: 0,
            step_count: 0,
            max_steps,
            last_score: 0.0,
            current_upgrades: Vec::new(),
            current_relics: Vec::new(),
        })
    }

    fn reset(&mut self, seed: Option<u32>) -> EncodedObservation {
        if let Some(seed) = seed {
            self.seed = seed;
        } else {
            self.seed = self
                .seed
                .wrapping_add(self.episode_index.wrapping_mul(0x9E3779B1));
        }
        self.episode_index = self.episode_index.wrapping_add(1);
        self.step_count = 0;
        self.last_score = 0.0;
        self.current_upgrades.clear();
        self.current_relics.clear();
        let account = engine_account_context(&self.bundle, &AccountSnapshot::default());
        self.engine.reset(Some(self.seed), Some(account));
        self.observe().0
    }

    fn observe(&mut self) -> (EncodedObservation, ActionMask) {
        let snapshot = self.engine.snapshot();
        if snapshot.state.pending_upgrades > 0 {
            if self.current_upgrades.is_empty() {
                self.current_upgrades = self.engine.draft_upgrades(4);
            }
        } else {
            self.current_upgrades.clear();
        }
        if snapshot.state.pending_chests > 0 {
            if self.current_relics.is_empty() {
                self.current_relics = self.engine.draft_relics(3);
            }
        } else {
            self.current_relics.clear();
        }
        let snapshot = self.engine.snapshot();
        (
            encode_observation(
                &self.bundle,
                &snapshot,
                &self.current_upgrades,
                &self.current_relics,
            ),
            action_mask(&snapshot, &self.current_upgrades, &self.current_relics),
        )
    }

    fn step(&mut self, action: RlAction) -> StepOutput {
        self.apply_decision_action(action);
        self.engine.set_input(EngineInput {
            keys: movement_keys(action.movement),
            pointer_x: 0.0,
            pointer_y: 0.0,
            pointer_inside: false,
            control_mode: "keyboard".to_string(),
        });
        self.engine.step(1.0 / 60.0);
        self.step_count = self.step_count.saturating_add(1);

        let snapshot = self.engine.snapshot();
        let score_delta = snapshot.state.score - self.last_score;
        self.last_score = snapshot.state.score;
        let terminated = snapshot.state.mode == "gameover";
        let truncated = self.step_count >= self.max_steps;
        let reward = score_delta + 0.01 - if terminated { 100.0 } else { 0.0 };
        let info = StepInfo {
            score: snapshot.state.score,
            pressure: snapshot.state.pressure,
            level: snapshot.state.level,
            elapsed_seconds: snapshot.state.run_elapsed_seconds,
            death: terminated,
            terminal_observation: None,
        };
        let obs = self.observe().0;
        StepOutput {
            obs,
            reward,
            terminated,
            truncated,
            info,
        }
    }

    fn step_auto_reset(&mut self, action: RlAction) -> StepOutput {
        let mut out = self.step(action);
        if out.terminated || out.truncated {
            let terminal_observation = out.obs.clone();
            out.obs = self.reset(None);
            out.info.terminal_observation = Some(terminal_observation);
        }
        out
    }

    fn action_mask(&mut self) -> ActionMask {
        self.observe().1
    }

    fn apply_decision_action(&mut self, action: RlAction) {
        let snapshot = self.engine.snapshot();
        if snapshot.state.pending_upgrades > 0 && action.upgrade_pick > 0 {
            if self.current_upgrades.is_empty() {
                self.current_upgrades = self.engine.draft_upgrades(4);
            }
            if let Some(choice) = self.current_upgrades.get(action.upgrade_pick - 1) {
                let _ = self
                    .engine
                    .apply_upgrade(&choice.upgrade_id, &choice.tier_id);
                self.current_upgrades.clear();
            }
        }
        let snapshot = self.engine.snapshot();
        if snapshot.state.pending_chests > 0 && action.relic_pick > 0 {
            if self.current_relics.is_empty() {
                self.current_relics = self.engine.draft_relics(3);
            }
            if let Some(choice) = self.current_relics.get(action.relic_pick - 1) {
                let _ = self.engine.apply_relic(&choice.relic_id);
                self.current_relics.clear();
            }
        }
    }
}

#[cfg(feature = "extension-module")]
#[pyclass(name = "Env")]
struct PyEnv {
    env: EpisodeEnv,
}

#[cfg(feature = "extension-module")]
#[pymethods]
impl PyEnv {
    #[new]
    #[pyo3(signature = (seed = 0, max_steps = 3600))]
    fn new(seed: u32, max_steps: u32) -> PyResult<Self> {
        Ok(Self {
            env: EpisodeEnv::new(seed, max_steps)
                .map_err(PyErr::new::<pyo3::exceptions::PyRuntimeError, _>)?,
        })
    }

    fn reset(&mut self, py: Python<'_>, seed: Option<u32>) -> PyResult<Py<PyAny>> {
        obs_to_py(py, &self.env.reset(seed))
    }

    fn step(
        &mut self,
        py: Python<'_>,
        action: Vec<usize>,
    ) -> PyResult<(Py<PyAny>, f64, bool, bool, Py<PyAny>)> {
        let out = self.env.step(parse_action(&action));
        Ok((
            obs_to_py(py, &out.obs)?,
            out.reward,
            out.terminated,
            out.truncated,
            info_to_py(py, &out.info)?,
        ))
    }

    fn action_masks(&mut self, py: Python<'_>) -> PyResult<Py<PyAny>> {
        mask_to_py(py, &self.env.action_mask())
    }

    fn observation_dim(&self) -> usize {
        OBS_VECTOR_DIM
    }

    fn action_dim(&self) -> usize {
        ACTION_LOGITS
    }
}

#[cfg(feature = "extension-module")]
#[pyclass(name = "VecEnv")]
struct PyVecEnv {
    envs: Vec<EpisodeEnv>,
}

#[cfg(feature = "extension-module")]
#[pymethods]
impl PyVecEnv {
    #[new]
    #[pyo3(signature = (num_envs, base_seed = 0, max_steps = 3600))]
    fn new(num_envs: usize, base_seed: u32, max_steps: u32) -> PyResult<Self> {
        if num_envs == 0 {
            return Err(PyErr::new::<pyo3::exceptions::PyValueError, _>(
                "num_envs must be > 0",
            ));
        }
        let envs = (0..num_envs)
            .map(|idx| {
                EpisodeEnv::new(
                    base_seed.wrapping_add((idx as u32).wrapping_mul(0x9E3779B1)),
                    max_steps,
                )
                .map_err(PyErr::new::<pyo3::exceptions::PyRuntimeError, _>)
            })
            .collect::<PyResult<Vec<_>>>()?;
        Ok(Self { envs })
    }

    fn reset(&mut self, py: Python<'_>) -> PyResult<Vec<Py<PyAny>>> {
        self.envs
            .iter_mut()
            .map(|env| obs_to_py(py, &env.reset(None)))
            .collect()
    }

    fn step_batch(
        &mut self,
        py: Python<'_>,
        actions: Vec<Vec<usize>>,
    ) -> PyResult<(
        Vec<Py<PyAny>>,
        Vec<f64>,
        Vec<bool>,
        Vec<bool>,
        Vec<Py<PyAny>>,
    )> {
        if actions.len() != self.envs.len() {
            return Err(PyErr::new::<pyo3::exceptions::PyValueError, _>(
                "actions length must match num_envs",
            ));
        }
        let outputs = self
            .envs
            .par_iter_mut()
            .zip(actions.into_par_iter())
            .map(|(env, action)| env.step_auto_reset(parse_action(&action)))
            .collect::<Vec<_>>();

        let mut obs = Vec::with_capacity(outputs.len());
        let mut rewards = Vec::with_capacity(outputs.len());
        let mut terminated = Vec::with_capacity(outputs.len());
        let mut truncated = Vec::with_capacity(outputs.len());
        let mut infos = Vec::with_capacity(outputs.len());
        for output in outputs {
            obs.push(obs_to_py(py, &output.obs)?);
            rewards.push(output.reward);
            terminated.push(output.terminated);
            truncated.push(output.truncated);
            infos.push(info_to_py(py, &output.info)?);
        }
        Ok((obs, rewards, terminated, truncated, infos))
    }

    fn action_masks(&mut self, py: Python<'_>) -> PyResult<Vec<Py<PyAny>>> {
        self.envs
            .iter_mut()
            .map(|env| mask_to_py(py, &env.action_mask()))
            .collect()
    }

    fn len(&self) -> usize {
        self.envs.len()
    }
}

fn parse_action(raw: &[usize]) -> RlAction {
    RlAction {
        movement: raw.first().copied().unwrap_or(0),
        upgrade_pick: raw.get(1).copied().unwrap_or(0),
        relic_pick: raw.get(2).copied().unwrap_or(0),
    }
}

#[cfg(feature = "extension-module")]
fn obs_to_py(py: Python<'_>, obs: &EncodedObservation) -> PyResult<Py<PyAny>> {
    let dict = PyDict::new(py);
    dict.set_item("scalar", obs.scalar.clone())?;
    dict.set_item("enemies", obs.enemies.clone())?;
    dict.set_item("owned_tags", obs.owned_tags.clone())?;
    dict.set_item("upgrade_choices", obs.upgrade_choices.clone())?;
    dict.set_item("relic_choices", obs.relic_choices.clone())?;
    Ok(dict.into_any().unbind())
}

#[cfg(feature = "extension-module")]
fn mask_to_py(py: Python<'_>, mask: &ActionMask) -> PyResult<Py<PyAny>> {
    let dict = PyDict::new(py);
    dict.set_item("movement", mask.movement.clone())?;
    dict.set_item("upgrade_pick", mask.upgrade_pick.clone())?;
    dict.set_item("relic_pick", mask.relic_pick.clone())?;
    dict.set_item("flat", mask.flatten())?;
    Ok(dict.into_any().unbind())
}

#[cfg(feature = "extension-module")]
fn info_to_py(py: Python<'_>, info: &StepInfo) -> PyResult<Py<PyAny>> {
    let dict = PyDict::new(py);
    dict.set_item("score", info.score)?;
    dict.set_item("pressure", info.pressure)?;
    dict.set_item("level", info.level)?;
    dict.set_item("elapsed_seconds", info.elapsed_seconds)?;
    dict.set_item("death", info.death)?;
    if let Some(obs) = &info.terminal_observation {
        dict.set_item("terminal_observation", obs_to_py(py, obs)?)?;
    }
    Ok(dict.into_any().unbind())
}

#[cfg(feature = "extension-module")]
#[pyfunction]
fn observation_dim() -> usize {
    OBS_VECTOR_DIM
}

#[cfg(feature = "extension-module")]
#[pyfunction]
fn action_dim() -> usize {
    ACTION_LOGITS
}

#[cfg(feature = "extension-module")]
#[pymodule]
fn voidline_py(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_class::<PyEnv>()?;
    m.add_class::<PyVecEnv>()?;
    m.add_function(wrap_pyfunction!(observation_dim, m)?)?;
    m.add_function(wrap_pyfunction!(action_dim, m)?)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn single_env_and_vec_env_match_for_first_seeded_step() {
        let mut single = EpisodeEnv::new(42, 600).unwrap();
        let mut vector = vec![EpisodeEnv::new(42, 600).unwrap()];

        let single_initial = single.reset(Some(42)).flatten();
        let vector_initial = vector[0].reset(Some(42)).flatten();
        assert_eq!(single_initial, vector_initial);

        let action = RlAction::default();
        let single_step = single.step(action).obs.flatten();
        let vector_step = vector[0].step(action).obs.flatten();
        assert_eq!(single_step, vector_step);
    }
}
