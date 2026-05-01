import importlib.util

import numpy as np
import pytest


pytestmark = pytest.mark.skipif(
    importlib.util.find_spec("voidline_py") is None,
    reason="voidline_py extension is not installed; run maturin develop first",
)


def test_gymnasium_reset_step_and_mask_contract():
    from voidline_rl.env_voidline import OBS_SHAPES, VoidlineEnv

    env = VoidlineEnv(seed=42, max_steps=8)

    obs, info = env.reset(seed=42)
    assert info == {}
    assert set(obs) == set(OBS_SHAPES)
    for key, shape in OBS_SHAPES.items():
        assert obs[key].shape == shape
        assert obs[key].dtype == np.float32

    masks = env.action_masks()
    assert masks.shape == (18,)
    assert masks.dtype == np.bool_
    assert masks.any()

    next_obs, reward, terminated, truncated, info = env.step([0, 0, 0])
    assert set(next_obs) == set(OBS_SHAPES)
    assert isinstance(reward, float)
    assert isinstance(terminated, bool)
    assert isinstance(truncated, bool)
    assert "score" in info


def test_maskable_vec_env_exposes_batched_action_masks():
    from sb3_contrib.common.maskable.utils import get_action_masks, is_masking_supported
    from stable_baselines3.common.vec_env import DummyVecEnv
    from voidline_rl.train import make_masked_env

    env = DummyVecEnv([make_masked_env(42, max_steps=8), make_masked_env(43, max_steps=8)])

    assert is_masking_supported(env)
    masks = get_action_masks(env)
    assert masks.shape == (2, 18)
    assert masks.dtype == np.bool_
