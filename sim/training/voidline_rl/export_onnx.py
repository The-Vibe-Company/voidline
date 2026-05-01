from __future__ import annotations

import argparse
from pathlib import Path

import torch
from sb3_contrib import MaskablePPO

from .env_voidline import OBS_SHAPES, action_dim, observation_dim


PERSONA_BIASES = {
    "learned-human": [0.0, 0.2, 0.1, 0.0, 0.1, 0.15, 0.05, 0.0, 0.05],
    "learned-optimizer": [0.0, 0.0, 0.2, 0.05, 0.0, 0.05, 0.15, 0.0, 0.0],
    "learned-explorer": [0.0, 0.05, 0.0, 0.15, 0.05, 0.0, 0.05, 0.15, 0.05],
    "learned-novice": [0.3, 0.05, 0.0, 0.05, 0.0, 0.02, 0.0, 0.02, 0.0],
}


class ExportedPolicy(torch.nn.Module):
    def __init__(self, persona: str, checkpoint: Path | None):
        super().__init__()
        self.checkpoint_policy = None
        if checkpoint is not None:
            if not checkpoint.exists():
                raise FileNotFoundError(f"checkpoint not found: {checkpoint}")
            self.checkpoint_policy = MaskablePPO.load(checkpoint, device="cpu").policy
            self.checkpoint_policy.eval()

        self.fallback = torch.nn.Linear(observation_dim(), action_dim())
        torch.nn.init.zeros_(self.fallback.weight)
        torch.nn.init.zeros_(self.fallback.bias)
        movement = PERSONA_BIASES.get(persona, PERSONA_BIASES["learned-human"])
        with torch.no_grad():
            self.fallback.bias[: len(movement)] = torch.tensor(movement)
            self.fallback.bias[9] = 0.0
            self.fallback.bias[10:14] = torch.tensor([0.1, 0.3, 0.2, 0.0])
            self.fallback.bias[14] = 0.0
            self.fallback.bias[15:18] = torch.tensor([0.2, 0.1, 0.0])

    def forward(self, flat_obs: torch.Tensor) -> torch.Tensor:
        if self.checkpoint_policy is None:
            return self.fallback(flat_obs)
        pieces = {}
        cursor = 0
        for key, shape in OBS_SHAPES.items():
            width = int(shape[0])
            pieces[key] = flat_obs[:, cursor : cursor + width]
            cursor += width
        features = self.checkpoint_policy.extract_features(pieces)
        latent_pi = self.checkpoint_policy.mlp_extractor.forward_actor(features)
        return self.checkpoint_policy.action_net(latent_pi)


def export_onnx(persona: str, checkpoint: Path | None, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    model = ExportedPolicy(persona, checkpoint)
    model.eval()
    dummy = torch.zeros((1, observation_dim()), dtype=torch.float32)
    torch.onnx.export(
        model,
        dummy,
        output,
        input_names=["observation"],
        output_names=["action_logits"],
        dynamic_axes={"observation": {0: "batch"}, "action_logits": {0: "batch"}},
        opset_version=13,
        dynamo=False,
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--persona", required=True)
    parser.add_argument("--checkpoint", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    export_onnx(args.persona, args.checkpoint, args.output)


if __name__ == "__main__":
    main()
