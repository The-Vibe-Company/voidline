"""Unit tests for the hardcoded heuristic agent.

These tests don't need voidline_py — they exercise the agent's scoring
and action selection logic on synthetic obs/mask dicts.
"""

import numpy as np
import pytest

from voidline_rl.hardcoded import (
    CHOICE_FEATURE_DIM,
    DAMAGE_INDEX,
    DIRECTION_CYCLE,
    HardcodedAgent,
    LEVEL_INDEX,
    SHIELD_INDEX,
    TAG_INDEX_OFFSET,
)


def make_obs(
    *,
    in_shop: bool = False,
    upgrade_choices: np.ndarray | None = None,
    relic_choices: np.ndarray | None = None,
    shop_choices: np.ndarray | None = None,
) -> dict[str, np.ndarray]:
    scalar = np.zeros(32, dtype=np.float32)
    if in_shop:
        scalar[31] = 1.0
    return {
        "scalar": scalar,
        "enemies": np.zeros(16, dtype=np.float32),
        "owned_tags": np.zeros(8, dtype=np.float32),
        "upgrade_choices": (
            upgrade_choices
            if upgrade_choices is not None
            else np.zeros(64, dtype=np.float32)
        ),
        "relic_choices": (
            relic_choices
            if relic_choices is not None
            else np.zeros(48, dtype=np.float32)
        ),
        "shop_choices": (
            shop_choices
            if shop_choices is not None
            else np.zeros(128, dtype=np.float32)
        ),
    }


def all_movement_allowed_mask() -> dict[str, np.ndarray]:
    return {
        "movement": np.ones(9, dtype=bool),
        "upgrade_pick": np.array(
            [True, False, False, False, False], dtype=bool
        ),
        "relic_pick": np.array([True, False, False, False], dtype=bool),
        "shop_pick": np.array(
            [True, False, False, False, False, False, False, False, False],
            dtype=bool,
        ),
    }


def test_movement_picks_circle_strafe_direction():
    agent = HardcodedAgent(seed=0)
    obs = make_obs(in_shop=False)
    masks = all_movement_allowed_mask()
    action = agent.predict(obs, masks)
    # First step picks DIRECTION_CYCLE[0]
    assert action[0] == DIRECTION_CYCLE[0]


def test_movement_in_shop_returns_noop():
    agent = HardcodedAgent(seed=0)
    obs = make_obs(in_shop=True)
    masks = all_movement_allowed_mask()
    action = agent.predict(obs, masks)
    assert action[0] == 0


def test_movement_with_flee_vector_runs_away_when_enemy_close():
    agent = HardcodedAgent(seed=0)
    obs = make_obs(in_shop=False)
    masks = all_movement_allowed_mask()
    # Enemy is close to the east → flee_dx should be -1, flee_dy = 0
    # The agent should head west when nearest_dist < 240.
    flee_vec = (-1.0, 0.0, 100.0, 0.0, 0.0)  # flee west, no center bias
    action = agent.predict(obs, masks, flee_vector=flee_vec)
    # Action 4 = West.
    assert action[0] == 4


def test_movement_without_flee_vector_falls_back_to_circle_strafe():
    agent = HardcodedAgent(seed=0)
    obs = make_obs(in_shop=False)
    masks = all_movement_allowed_mask()
    action = agent.predict(obs, masks, flee_vector=None)
    assert action[0] == DIRECTION_CYCLE[0]


def test_upgrade_pick_prefers_high_damage_slot():
    # Build 4 upgrade slots; slot 2 has heavy damage signal.
    choices = np.zeros((4, CHOICE_FEATURE_DIM), dtype=np.float32)
    for i in range(4):
        choices[i, 0] = 1.0  # presence
        choices[i, 1] = 1.0  # tier_power
    choices[2, DAMAGE_INDEX] = 0.9  # high damage
    choices[2, TAG_INDEX_OFFSET + 0] = 1.0  # cannon tag
    flat = choices.reshape(-1)
    obs = make_obs(upgrade_choices=flat)
    masks = all_movement_allowed_mask()
    masks["upgrade_pick"] = np.array(
        [False, True, True, True, True], dtype=bool
    )
    agent = HardcodedAgent(seed=0)
    action = agent.predict(obs, masks)
    # Slot 2 corresponds to upgrade_pick action 3 (index+1)
    assert action[1] == 3


def test_upgrade_pick_returns_zero_when_no_offer():
    agent = HardcodedAgent(seed=0)
    obs = make_obs()
    masks = all_movement_allowed_mask()
    action = agent.predict(obs, masks)
    assert action[1] == 0


def test_relic_pick_grabs_first_offered_slot():
    agent = HardcodedAgent(seed=0)
    obs = make_obs()
    masks = all_movement_allowed_mask()
    masks["relic_pick"] = np.array(
        [False, False, True, True], dtype=bool
    )
    action = agent.predict(obs, masks)
    assert action[2] == 2  # first offered (action index = relic-slot+1)


def test_shop_pick_prefers_fresh_unlocks_in_shop_phase():
    # Two shop slots: slot 0 is at level 1 (maxed), slot 1 is fresh.
    choices = np.zeros((8, CHOICE_FEATURE_DIM), dtype=np.float32)
    choices[0, 0] = 1.0
    choices[0, LEVEL_INDEX] = 1.0  # maxed
    choices[1, 0] = 1.0
    choices[1, LEVEL_INDEX] = 0.0  # fresh
    flat = choices.reshape(-1)
    obs = make_obs(in_shop=True, shop_choices=flat)
    masks = all_movement_allowed_mask()
    masks["shop_pick"] = np.array(
        [True, True, True, False, False, False, False, False, False],
        dtype=bool,
    )
    agent = HardcodedAgent(seed=0)
    action = agent.predict(obs, masks)
    # Slot 1 (fresh) should win → shop_pick action = 2.
    assert action[3] == 2


def test_shop_pick_returns_zero_outside_shop_phase():
    choices = np.zeros((8, CHOICE_FEATURE_DIM), dtype=np.float32)
    choices[0, 0] = 1.0
    flat = choices.reshape(-1)
    obs = make_obs(in_shop=False, shop_choices=flat)
    masks = all_movement_allowed_mask()
    agent = HardcodedAgent(seed=0)
    action = agent.predict(obs, masks)
    assert action[3] == 0
