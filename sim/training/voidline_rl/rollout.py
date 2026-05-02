"""Collect (obs, action, mask) trajectories from the hardcoded agent.

Output is a compressed ``.npz`` ready to feed Behavior Cloning. Each
record corresponds to a single env step; episode boundaries are not
preserved (BC does not need them).

Schema
------
- ``obs_<key>`` for each obs dict key (scalar/enemies/owned_tags/...)
  shape (N, *obs_shape)
- ``actions``: shape (N, 4) — [movement, upgrade, relic, shop]
- ``masks``: shape (N, ACTION_LOGITS) — flat per-logit boolean mask
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np

from .env_voidline import OBS_SHAPES, VoidlineEnv
from .eval import DEFAULT_MAX_STEPS
from .hardcoded import HardcodedAgent


def collect(
    *,
    episodes: int,
    runs_per_episode: int,
    max_steps: int,
    seed: int,
) -> dict[str, np.ndarray]:
    obs_buffers: dict[str, list[np.ndarray]] = {key: [] for key in OBS_SHAPES}
    action_buffer: list[np.ndarray] = []
    mask_buffer: list[np.ndarray] = []

    for ep_idx in range(episodes):
        ep_seed = (seed + ep_idx * 0x9E3779B1) & 0xFFFFFFFF
        env = VoidlineEnv(
            seed=ep_seed,
            max_steps=max_steps,
            runs_per_episode=runs_per_episode,
        )
        obs, _ = env.reset(seed=ep_seed)
        agent = HardcodedAgent(seed=ep_seed)

        while True:
            mask_dict_raw = env._env.action_masks()  # noqa: SLF001
            mask_dict = {
                "movement": np.asarray(mask_dict_raw["movement"], dtype=bool),
                "upgrade_pick": np.asarray(mask_dict_raw["upgrade_pick"], dtype=bool),
                "relic_pick": np.asarray(mask_dict_raw["relic_pick"], dtype=bool),
                "shop_pick": np.asarray(mask_dict_raw["shop_pick"], dtype=bool),
            }
            flat_mask = np.asarray(mask_dict_raw["flat"], dtype=bool)
            action = np.asarray(env._env.expert_action(), dtype=np.int64)  # noqa: SLF001
            if action[3] == 0 and mask_dict["shop_pick"][1:].any():
                shop_action = agent._select_shop(obs, mask_dict)  # noqa: SLF001
                if shop_action != 0:
                    action[3] = shop_action

            for key in OBS_SHAPES:
                obs_buffers[key].append(obs[key].copy())
            action_buffer.append(action.copy())
            mask_buffer.append(flat_mask.copy())

            obs, _reward, terminated, truncated, _info = env.step(action)
            if terminated or truncated:
                break

        if (ep_idx + 1) % max(1, episodes // 10) == 0:
            print(
                f"[rollout] episode {ep_idx + 1}/{episodes} "
                f"({len(action_buffer)} steps total)",
                flush=True,
            )

    out: dict[str, np.ndarray] = {}
    for key, buffer in obs_buffers.items():
        out[f"obs_{key}"] = np.stack(buffer, axis=0).astype(np.float32)
    out["actions"] = np.stack(action_buffer, axis=0).astype(np.int64)
    out["masks"] = np.stack(mask_buffer, axis=0).astype(np.bool_)
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--episodes", type=int, default=200)
    parser.add_argument("--runs-per-episode", type=int, default=4)
    parser.add_argument("--max-steps", type=int, default=DEFAULT_MAX_STEPS["quick"])
    parser.add_argument("--seed", type=int, default=1109)
    args = parser.parse_args()

    args.output.parent.mkdir(parents=True, exist_ok=True)
    print(
        f"[rollout] collecting {args.episodes} episodes "
        f"(max_steps={args.max_steps}, runs/ep={args.runs_per_episode})",
        flush=True,
    )
    data = collect(
        episodes=args.episodes,
        runs_per_episode=args.runs_per_episode,
        max_steps=args.max_steps,
        seed=args.seed,
    )
    np.savez_compressed(args.output, **data)
    n_steps = data["actions"].shape[0]
    size_mb = args.output.stat().st_size / 1024 / 1024
    print(f"[rollout] wrote {args.output} ({n_steps} steps, {size_mb:.1f} MB)")


if __name__ == "__main__":
    main()
