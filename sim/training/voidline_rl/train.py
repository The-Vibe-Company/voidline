from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import yaml
from sb3_contrib import MaskablePPO
from sb3_contrib.common.maskable.utils import is_masking_supported
from sb3_contrib.common.wrappers import ActionMasker
from stable_baselines3.common.vec_env import DummyVecEnv

from .env_voidline import make_env
from .export_onnx import export_onnx


PERSONAS = ["oracle"]


def load_config(path: Path) -> dict:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as fh:
        return yaml.safe_load(fh) or {}


def train_persona(persona: str, model_dir: Path, timesteps: int, seed: int, config: dict) -> None:
    model_dir.mkdir(parents=True, exist_ok=True)
    n_envs = int(config.get("n_envs", 1))
    max_steps = int(config.get("max_steps", 3600))
    runs_per_episode = int(config.get("runs_per_episode", 150))
    env = DummyVecEnv(
        [
            make_masked_env(seed + i, max_steps=max_steps, runs_per_episode=runs_per_episode)
            for i in range(n_envs)
        ]
    )
    if not is_masking_supported(env):
        raise RuntimeError("Voidline training env does not expose action_masks")
    model = MaskablePPO(
        "MultiInputPolicy",
        env,
        seed=seed,
        verbose=int(config.get("verbose", 0)),
        n_steps=int(config.get("n_steps", 64)),
        batch_size=int(config.get("batch_size", 64)),
        n_epochs=int(config.get("n_epochs", 2)),
        gamma=float(config.get("gamma", 0.99)),
        learning_rate=float(config.get("learning_rate", 3e-4)),
        ent_coef=float(config.get("ent_coef", 0.0)),
        clip_range=float(config.get("clip_range", 0.2)),
        device=config.get("device", "auto"),
    )
    model.learn(total_timesteps=timesteps)
    checkpoint = model_dir / f"{persona}.zip"
    model.save(checkpoint)
    onnx_path = model_dir / f"{persona}.onnx"
    export_onnx(persona, checkpoint, onnx_path)
    metadata = {
        "persona": persona,
        "timesteps": timesteps,
        "seed": seed,
        "checkpoint": str(checkpoint),
        "onnx": str(onnx_path),
    }
    (model_dir / f"{persona}.json").write_text(json.dumps(metadata, indent=2) + "\n")


def make_masked_env(seed: int, max_steps: int, runs_per_episode: int = 150):
    def _factory():
        env = make_env(seed, max_steps=max_steps, runs_per_episode=runs_per_episode)()
        return ActionMasker(env, lambda wrapped_env: wrapped_env.action_masks())

    return _factory


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--persona", choices=PERSONAS + ["all"], default="all")
    parser.add_argument(
        "--model-dir",
        type=Path,
        default=Path(os.environ.get("VOIDLINE_RL_MODEL_DIR", ".context/rl-models")),
    )
    parser.add_argument(
        "--timesteps",
        type=int,
        default=int(os.environ.get("VOIDLINE_RL_TIMESTEPS", "4000000")),
    )
    parser.add_argument("--seed", type=int, default=1109)
    parser.add_argument("--config-dir", type=Path, default=Path(__file__).resolve().parents[1] / "configs")
    args = parser.parse_args()

    personas = PERSONAS if args.persona == "all" else [args.persona]
    for offset, persona in enumerate(personas):
        config = load_config(args.config_dir / f"{persona}.yaml")
        train_persona(persona, args.model_dir, args.timesteps, args.seed + offset, config)


if __name__ == "__main__":
    main()
