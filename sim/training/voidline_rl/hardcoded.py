"""Hardcoded heuristic oracle agent.

Acts as a baseline that proves the env is solvable by a simple strategy
(circle-strafe + damage-build drafts). Used as Behavior Cloning seed for
PPO training so the policy starts above random.

The encoded observation does not preserve individual enemy positions
(only per-type aggregates), so movement uses a time-rotating circle
strafe rather than a true flee vector. This is the strongest signal we
can extract without hacking new fields into the Rust→Python binding.

Action space mirrors VoidlineEnv: ``[movement, upgrade_pick, relic_pick,
shop_pick]`` with masking enforced by the env.
"""

from __future__ import annotations

from typing import Sequence

import numpy as np


# Choice feature layout (must match voidline-meta::obs::tag_features +
# add_effect_features). Index 0 is presence, 1 is tier_power, 2-9 are
# build tag flags, 10 is damage proxy, 11 shield/regen, 12 hp/lifesteal,
# 13 speed, 14 pickup, 15 level progress.
CHOICE_FEATURE_DIM = 16
TAG_INDEX_OFFSET = 2
TAG_NAMES = (
    "cannon",  # 2
    "salvage",  # 3
    "magnet",  # 4
    "shield",  # 5
    "pierce",  # 6
    "drone",  # 7
    "crit",  # 8
    "mobility",  # 9
)
DAMAGE_INDEX = 10
SHIELD_INDEX = 11
HP_INDEX = 12
SPEED_INDEX = 13
PICKUP_INDEX = 14
LEVEL_INDEX = 15

# Movement: 0 = noop, 1-8 = N, E, S, W, NE, SE, SW, NW. Circle-strafe
# rotates through the 8 cardinal directions, switching every K frames so
# the player is always moving.
CIRCLE_STRAFE_PERIOD = 18
DIRECTION_CYCLE: Sequence[int] = (1, 5, 2, 6, 3, 7, 4, 8)


class HardcodedAgent:
    """Heuristic agent that produces an action per env step.

    Does NOT use the trained policy; designed to be deterministic given
    a seed so we can reproduce rollouts for BC.
    """

    def __init__(self, seed: int = 0) -> None:
        self._step_index = 0
        self._rng = np.random.default_rng(seed)

    # --- public API ----------------------------------------------------

    def predict(
        self,
        obs: dict[str, np.ndarray],
        action_masks: dict[str, np.ndarray] | None = None,
        flee_vector: tuple[float, float, float, float, float] | None = None,
    ) -> np.ndarray:
        """Return ``[movement, upgrade_pick, relic_pick, shop_pick]``.

        ``action_masks`` is the dict form (see env_voidline.action_masks).
        ``flee_vector`` is ``(flee_dx, flee_dy, nearest_dist, center_dx,
        center_dy)`` from ``voidline_py.Env.flee_vector()``. When None,
        falls back to circle-strafe.
        """
        movement = self._select_movement(obs, action_masks, flee_vector)
        upgrade_pick = self._select_upgrade(obs, action_masks)
        relic_pick = self._select_relic(obs, action_masks)
        shop_pick = self._select_shop(obs, action_masks)
        self._step_index += 1
        return np.asarray([movement, upgrade_pick, relic_pick, shop_pick], dtype=np.int64)

    # --- helpers -------------------------------------------------------

    def _select_movement(
        self,
        obs: dict[str, np.ndarray],
        masks: dict[str, np.ndarray] | None,
        flee_vector: tuple[float, float, float, float, float] | None,
    ) -> int:
        scalar = obs["scalar"]
        in_shop = scalar[31] > 0.5
        if in_shop:
            return 0

        if flee_vector is not None:
            flee_dx, flee_dy, nearest_dist, center_dx, center_dy = flee_vector
            # When enemies are close, run away. When the arena edge is
            # closer than enemies, bias toward center to avoid corner death.
            danger = nearest_dist < 240.0  # contact-zone scaling
            edge_proximity = 1.0 - min(scalar[16], 1.0 - scalar[16]) * 2.0
            if danger:
                dx, dy = flee_dx, flee_dy
            elif edge_proximity > 0.6:
                dx, dy = center_dx, center_dy
            else:
                # No urgent threat — keep moving with a slow rotation
                # to avoid stationary clustering.
                phase = self._step_index * 0.05
                dx = flee_dx * 0.5 + np.cos(phase)
                dy = flee_dy * 0.5 + np.sin(phase)
            direction = self._snap_to_8way(dx, dy)
        else:
            direction_idx = (self._step_index // CIRCLE_STRAFE_PERIOD) % len(DIRECTION_CYCLE)
            direction = DIRECTION_CYCLE[direction_idx]

        if masks is not None:
            allowed = np.asarray(masks.get("movement", []), dtype=bool)
            if allowed.size > direction and not allowed[direction]:
                fallback = np.flatnonzero(allowed)
                if fallback.size > 0:
                    direction = int(fallback[0])
        return int(direction)

    @staticmethod
    def _snap_to_8way(dx: float, dy: float) -> int:
        """Snap a continuous direction to 1-8 (8-way movement actions).

        Movement encoding (matches voidline_meta::obs::movement_keys):
          1 = N (W key, dy < 0), 2 = E (D, dx > 0), 3 = S (S, dy > 0),
          4 = W (A, dx < 0), 5 = NE, 6 = SE, 7 = SW, 8 = NW.

        Note: the env uses screen-y-down coordinates (player.y increases
        downward). dy > 0 means "south" in player coords.
        """
        eps = 1e-6
        if abs(dx) < eps and abs(dy) < eps:
            return 0
        # Compute angle in screen space; 0° = east, 90° = south.
        angle = np.degrees(np.arctan2(dy, dx))  # -180..180
        # Bucket into 8 directions, 45° each, centered on cardinals.
        # Use east as 0° → action 2.
        # Mapping: angle in [-22.5, 22.5) → E (2), [22.5, 67.5) → SE (6), ...
        sector = int(((angle + 22.5) // 45) + 8) % 8
        # Map sector index → action id.
        # sector 0 = E (action 2), 1 = SE (6), 2 = S (3), 3 = SW (7),
        # 4 = W (4), 5 = NW (8), 6 = N (1), 7 = NE (5)
        return [2, 6, 3, 7, 4, 8, 1, 5][sector]

    def _select_upgrade(
        self,
        obs: dict[str, np.ndarray],
        masks: dict[str, np.ndarray] | None,
    ) -> int:
        if masks is not None:
            allowed = np.asarray(masks.get("upgrade_pick", []), dtype=bool)
            if allowed.size == 0 or not allowed[1:].any():
                return 0
        # Score each of the 4 draft slots by build value.
        choices = obs["upgrade_choices"].reshape(-1, CHOICE_FEATURE_DIM)
        return self._score_draft_slots(choices, masks, "upgrade_pick")

    def _select_relic(
        self,
        obs: dict[str, np.ndarray],
        masks: dict[str, np.ndarray] | None,
    ) -> int:
        # Relics are universally beneficial — if any slot is offered,
        # take the first allowed slot.
        if masks is None:
            return 0
        allowed = np.asarray(masks.get("relic_pick", []), dtype=bool)
        offered = np.flatnonzero(allowed[1:]) if allowed.size > 1 else np.array([])
        if offered.size == 0:
            return 0
        return int(offered[0]) + 1

    def _select_shop(
        self,
        obs: dict[str, np.ndarray],
        masks: dict[str, np.ndarray] | None,
    ) -> int:
        if masks is None:
            return 0
        allowed = np.asarray(masks.get("shop_pick", []), dtype=bool)
        if allowed.size == 0 or not allowed.any():
            return 0
        scalar = obs["scalar"]
        in_shop = scalar[31] > 0.5
        if not in_shop:
            return 0
        # Score affordable shop slots: prefer cards (kind contributes via
        # encoded tag flags), then unique unlocks. Cost is implicit (env
        # only exposes affordable slots) so we score by build value.
        choices = obs["shop_choices"].reshape(-1, CHOICE_FEATURE_DIM)
        scores: list[tuple[float, int]] = []
        for idx in range(choices.shape[0]):
            slot_action = idx + 1
            if slot_action >= allowed.size or not allowed[slot_action]:
                continue
            row = choices[idx]
            if row[0] < 0.5:  # not populated
                continue
            score = self._shop_slot_score(row)
            scores.append((score, slot_action))
        if not scores:
            # Nothing worth buying → start the next run.
            return 0
        scores.sort(reverse=True)
        return int(scores[0][1])

    def _score_draft_slots(
        self,
        choices: np.ndarray,
        masks: dict[str, np.ndarray] | None,
        mask_key: str,
    ) -> int:
        allowed = (
            np.asarray(masks.get(mask_key, []), dtype=bool)
            if masks is not None
            else None
        )
        best_score = float("-inf")
        best_action = 0
        for slot_idx in range(choices.shape[0]):
            slot_action = slot_idx + 1
            if allowed is not None and (
                slot_action >= allowed.size or not allowed[slot_action]
            ):
                continue
            row = choices[slot_idx]
            if row[0] < 0.5:
                continue
            score = self._draft_slot_score(row)
            if score > best_score:
                best_score = score
                best_action = slot_action
        return int(best_action) if best_action > 0 else 0

    @staticmethod
    def _draft_slot_score(row: np.ndarray) -> float:
        """Score a draft slot. Heavy weight on damage proxy, moderate on
        shield/hp (survival), small on speed/pickup. Tag bonuses encode
        synergy preferences (cannon + pierce + drone build).
        """
        damage = float(row[DAMAGE_INDEX])
        shield = float(row[SHIELD_INDEX])
        hp = float(row[HP_INDEX])
        speed = float(row[SPEED_INDEX])
        pickup = float(row[PICKUP_INDEX])
        tier_power = float(row[1])

        tag_bonus = 0.0
        # cannon, pierce, drone: amplify damage build
        tag_bonus += 1.5 * float(row[TAG_INDEX_OFFSET + 0])  # cannon
        tag_bonus += 1.0 * float(row[TAG_INDEX_OFFSET + 4])  # pierce
        tag_bonus += 1.0 * float(row[TAG_INDEX_OFFSET + 5])  # drone
        # shield, salvage: survival
        tag_bonus += 0.6 * float(row[TAG_INDEX_OFFSET + 1])  # salvage
        tag_bonus += 0.6 * float(row[TAG_INDEX_OFFSET + 3])  # shield
        # crit: damage multiplier
        tag_bonus += 0.4 * float(row[TAG_INDEX_OFFSET + 6])  # crit
        # magnet, mobility: utility
        tag_bonus += 0.2 * float(row[TAG_INDEX_OFFSET + 2])  # magnet
        tag_bonus += 0.2 * float(row[TAG_INDEX_OFFSET + 7])  # mobility

        return (
            5.0 * damage
            + 2.0 * shield
            + 2.0 * hp
            + 0.5 * speed
            + 0.3 * pickup
            + 0.7 * tier_power
            + tag_bonus
        )

    @staticmethod
    def _shop_slot_score(row: np.ndarray) -> float:
        """Score a shop slot. Same general framework as drafts, but
        prefer fresh unlocks (level=0) over almost-maxed (level=1.0) so
        the agent broadens its build before deepening it.
        """
        progress = float(row[LEVEL_INDEX])  # 0 = fresh, 1 = maxed
        # The kind encoding adds 0.5 to row[8] for unique, 0.5 to row[9]
        # for rarity, 1.0 to row[9] for utility. Tags mostly come from the
        # meta upgrade's build tag (single string).
        unique_bonus = 0.5 if float(row[TAG_INDEX_OFFSET + 6]) >= 0.5 else 0.0
        damage = float(row[DAMAGE_INDEX])
        shield = float(row[SHIELD_INDEX])
        hp = float(row[HP_INDEX])

        # Fresh > almost-maxed.
        progress_score = 1.0 - progress

        return (
            2.0 * progress_score
            + 1.5 * unique_bonus
            + 1.0 * damage
            + 0.6 * shield
            + 0.6 * hp
        )
