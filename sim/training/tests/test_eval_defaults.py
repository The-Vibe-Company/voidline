"""Regression tests for eval.py mode-specific defaults.

The stage 1 boss spawns at ~600s game-time (36000 frames at 60fps), so any
default below that produces structurally invalid stage-clear metrics. This
guards against accidental regression of the per-mode horizon.
"""

from voidline_rl.eval import DEFAULT_MAX_STEPS, MIN_TARGET_OFFERS_FOR_VERDICT


STAGE1_BOSS_FRAMES = 36000  # 600s × 60fps


def test_quick_mode_can_observe_stage1_boss():
    assert DEFAULT_MAX_STEPS["quick"] >= STAGE1_BOSS_FRAMES, (
        "quick mode default must allow stage 1 boss spawn (≥36000 frames); "
        f"got {DEFAULT_MAX_STEPS['quick']}"
    )


def test_full_mode_covers_stage2_horizon():
    # Stage 2 spawns at 1560s = 93600 frames; full mode must cover this.
    assert DEFAULT_MAX_STEPS["full"] >= 93600, (
        f"full mode default must cover stage 2 boss; got {DEFAULT_MAX_STEPS['full']}"
    )


def test_test_card_mode_covers_stage1_horizon():
    assert DEFAULT_MAX_STEPS["test-card"] >= STAGE1_BOSS_FRAMES, (
        "test-card mode default must allow stage 1 boss spawn"
    )


def test_min_offers_threshold_is_meaningful():
    # Less than 5 offers makes a verdict noise; the threshold must be ≥ 5.
    assert MIN_TARGET_OFFERS_FOR_VERDICT >= 5
