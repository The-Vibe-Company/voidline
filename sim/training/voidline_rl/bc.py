"""Behavior Cloning from hardcoded rollouts.

Trains a MaskablePPO policy via supervised learning so PPO curriculum
starts above random. Output is a sb3-compatible ``.zip`` checkpoint
that ``train.py`` warm-starts from automatically.

The training objective is cross-entropy on the agent's action under the
policy distribution (with masking). An entropy bonus keeps the policy
from collapsing to a deterministic action and helps PPO continuation
explore further.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import torch
from sb3_contrib import MaskablePPO
from sb3_contrib.common.maskable.utils import is_masking_supported
from sb3_contrib.common.wrappers import ActionMasker
from stable_baselines3.common.vec_env import DummyVecEnv

from .env_voidline import OBS_SHAPES, VoidlineEnv


def _make_dummy_env(seed: int = 0) -> DummyVecEnv:
    def _factory():
        env = VoidlineEnv(seed=seed, max_steps=600, runs_per_episode=1)
        return ActionMasker(env, lambda inner: inner.action_masks())

    return DummyVecEnv([_factory])


def _build_model(env, *, lr: float, ent_coef: float, device: str) -> MaskablePPO:
    return MaskablePPO(
        "MultiInputPolicy",
        env,
        learning_rate=lr,
        ent_coef=ent_coef,
        n_steps=64,
        batch_size=64,
        n_epochs=1,
        device=device,
        verbose=0,
    )


def _iter_minibatches(
    rng: np.random.Generator,
    n_samples: int,
    batch_size: int,
):
    indices = rng.permutation(n_samples)
    for start in range(0, n_samples, batch_size):
        yield indices[start : start + batch_size]


def train_bc(
    rollout_path: Path,
    output_path: Path,
    *,
    epochs: int,
    batch_size: int,
    lr: float,
    ent_coef: float,
    device: str,
    seed: int,
) -> None:
    print(f"[bc] loading rollout {rollout_path}", flush=True)
    data = np.load(rollout_path)
    obs_arrays = {key: data[f"obs_{key}"] for key in OBS_SHAPES}
    actions = data["actions"]
    masks = data["masks"]
    n_samples = actions.shape[0]
    print(f"[bc] {n_samples} steps × {epochs} epochs (batch={batch_size})", flush=True)

    env = _make_dummy_env(seed=seed)
    if not is_masking_supported(env):
        raise RuntimeError("dummy env does not expose action_masks")
    model = _build_model(env, lr=lr, ent_coef=ent_coef, device=device)

    policy = model.policy
    policy.train()
    optimizer = torch.optim.Adam(policy.parameters(), lr=lr)

    rng = np.random.default_rng(seed)
    torch_device = next(policy.parameters()).device

    for epoch in range(epochs):
        epoch_loss = 0.0
        epoch_entropy = 0.0
        n_batches = 0
        for batch_idx in _iter_minibatches(rng, n_samples, batch_size):
            obs_batch = {
                key: torch.as_tensor(
                    obs_arrays[key][batch_idx], dtype=torch.float32, device=torch_device
                )
                for key in OBS_SHAPES
            }
            action_batch = torch.as_tensor(
                actions[batch_idx], dtype=torch.long, device=torch_device
            )
            mask_batch = torch.as_tensor(
                masks[batch_idx], dtype=torch.bool, device=torch_device
            )

            _values, log_prob, entropy = policy.evaluate_actions(
                obs_batch, action_batch, action_masks=mask_batch
            )
            loss = -(log_prob.mean()) - ent_coef * entropy.mean()

            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(policy.parameters(), 0.5)
            optimizer.step()

            epoch_loss += float(loss.detach().cpu())
            epoch_entropy += float(entropy.mean().detach().cpu())
            n_batches += 1

        print(
            f"[bc] epoch {epoch + 1}/{epochs} "
            f"loss={epoch_loss / max(1, n_batches):.4f} "
            f"entropy={epoch_entropy / max(1, n_batches):.4f}",
            flush=True,
        )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    model.save(output_path)
    print(f"[bc] saved {output_path}", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--rollout", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--epochs", type=int, default=4)
    parser.add_argument("--batch-size", type=int, default=128)
    parser.add_argument("--lr", type=float, default=3e-4)
    parser.add_argument("--ent-coef", type=float, default=0.01)
    parser.add_argument("--device", default="auto")
    parser.add_argument("--seed", type=int, default=1109)
    args = parser.parse_args()

    train_bc(
        args.rollout,
        args.output,
        epochs=args.epochs,
        batch_size=args.batch_size,
        lr=args.lr,
        ent_coef=args.ent_coef,
        device=args.device,
        seed=args.seed,
    )


if __name__ == "__main__":
    main()
