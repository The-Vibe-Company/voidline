from __future__ import annotations

from typing import Any

import gymnasium as gym
import numpy as np
from gymnasium import spaces

import voidline_py


OBS_SHAPES = {
    "scalar": (32,),
    "enemies": (16,),
    "owned_tags": (8,),
    "upgrade_choices": (64,),
    "relic_choices": (48,),
}


def observation_dim() -> int:
    return int(voidline_py.observation_dim())


def action_dim() -> int:
    return int(voidline_py.action_dim())


def flatten_observation(obs: dict[str, np.ndarray]) -> np.ndarray:
    return np.concatenate([obs[key].reshape(-1) for key in OBS_SHAPES], dtype=np.float32)


def convert_observation(raw: dict[str, Any]) -> dict[str, np.ndarray]:
    converted: dict[str, np.ndarray] = {}
    for key, shape in OBS_SHAPES.items():
        arr = np.asarray(raw[key], dtype=np.float32)
        converted[key] = arr.reshape(shape)
    return converted


class VoidlineEnv(gym.Env):
    metadata = {"render_modes": []}

    def __init__(self, seed: int = 0, max_steps: int = 3600):
        super().__init__()
        self._env = voidline_py.Env(seed=seed, max_steps=max_steps)
        self.action_space = spaces.MultiDiscrete([9, 5, 4])
        self.observation_space = spaces.Dict(
            {
                key: spaces.Box(low=-1.0, high=1.0, shape=shape, dtype=np.float32)
                for key, shape in OBS_SHAPES.items()
            }
        )

    def reset(self, *, seed: int | None = None, options: dict[str, Any] | None = None):
        super().reset(seed=seed)
        raw = self._env.reset(seed)
        return convert_observation(raw), {}

    def step(self, action):
        raw_obs, reward, terminated, truncated, info = self._env.step(
            np.asarray(action, dtype=np.int64).tolist()
        )
        converted = convert_observation(raw_obs)
        if "terminal_observation" in info:
            info["terminal_observation"] = convert_observation(info["terminal_observation"])
        return converted, float(reward), bool(terminated), bool(truncated), info

    def action_masks(self) -> np.ndarray:
        raw = self._env.action_masks()
        return np.asarray(raw["flat"], dtype=bool)


def make_env(seed: int = 0, max_steps: int = 3600):
    def _factory() -> VoidlineEnv:
        return VoidlineEnv(seed=seed, max_steps=max_steps)

    return _factory
