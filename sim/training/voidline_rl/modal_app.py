from __future__ import annotations

import json
import os
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

import modal


APP_NAME = "voidline-balance"
REMOTE_REPO = Path("/workspace/voidline")
REPORT_ROOT = Path("/reports")
MODEL_ROOT = Path("/models")
CACHE_ROOT = Path("/mnt/voidline-cache")


def _repo_root_for_modal_image() -> Path:
    for parent in [Path(__file__).resolve(), *Path(__file__).resolve().parents]:
        if (parent / "package.json").exists() and (parent / "sim").exists():
            return parent
    return REMOTE_REPO


LOCAL_REPO_ROOT = _repo_root_for_modal_image()

reports_volume = modal.Volume.from_name("voidline-balance-reports", create_if_missing=True)
models_volume = modal.Volume.from_name("voidline-rl-models", create_if_missing=True)
cache_volume = modal.Volume.from_name("voidline-balance-cache", create_if_missing=True)

app = modal.App(APP_NAME)

IMAGE_IGNORE = [
    ".git",
    ".context",
    "node_modules",
    ".venv",
    "dist",
    "sim/target",
    "sim/training/.venv",
    "sim/training/models",
    "sim/training/runs",
    "src/generated/voidline-wasm/pkg",
    "*.onnx",
    "*.zip",
    "*.pt",
    "*.pth",
    "*.pyc",
    "__pycache__",
    "scripts/*report*.json",
]

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install(
        "bash",
        "build-essential",
        "ca-certificates",
        "coreutils",
        "curl",
        "pkg-config",
        "libssl-dev",
    )
    .pip_install(
        "uv>=0.5",
        "modal>=1.1",
        "gymnasium>=1.0",
        "maturin>=1.8,<2",
        "numpy>=1.26",
        "onnx>=1.16",
        "onnxscript>=0.1",
        "pyyaml>=6.0",
        "sb3-contrib==2.8.0",
        "stable-baselines3==2.8.0",
        "torch>=2.3",
    )
    .run_commands("curl https://sh.rustup.rs -sSf | sh -s -- -y --profile minimal")
    .env(
        {
            "PATH": "/root/.cargo/bin:/usr/local/bin:/usr/bin:/bin",
            "RAYON_NUM_THREADS": "64",
        }
    )
    .workdir(str(REMOTE_REPO))
    .add_local_dir(LOCAL_REPO_ROOT, str(REMOTE_REPO), ignore=IMAGE_IGNORE)
)


def _base_report_command(output_path: Path, checkpoint_dir: Path) -> list[str]:
    return [
        "scripts/meta-progression-report.sh",
        "--default",
        "--player-profile",
        "skilled",
        "--campaigns",
        "12",
        "--runs",
        "48",
        "--max-pressure",
        "80",
        "--trial-seconds",
        "720",
        "--max-seconds",
        "180",
        "--checkpoint-dir",
        str(checkpoint_dir),
        "--output",
        str(output_path),
    ]


def _profile_quick(output_path: Path, checkpoint_dir: Path, model_dir: Path) -> list[str]:
    return [
        "scripts/meta-progression-report.sh",
        "--default",
        "--player-profile",
        "skilled",
        "--campaigns",
        "6",
        "--runs",
        "32",
        "--max-pressure",
        "80",
        "--trial-seconds",
        "720",
        "--max-seconds",
        "180",
        "--policy-set",
        "focused",
        "--checkpoint-dir",
        str(checkpoint_dir),
        "--output",
        str(output_path),
    ]


def _profile_check(output_path: Path, checkpoint_dir: Path, model_dir: Path) -> list[str]:
    return [
        "scripts/meta-progression-report.sh",
        "--default",
        "--player-profile",
        "skilled",
        "--campaigns",
        "12",
        "--runs",
        "120",
        "--max-pressure",
        "80",
        "--trial-seconds",
        "720",
        "--max-seconds",
        "360",
        "--check-target",
        "balance",
        "--policy-set",
        "focused",
        "--checkpoint-dir",
        str(checkpoint_dir),
        "--output",
        str(output_path),
    ]


def _meta_report(output_path: Path, checkpoint_dir: Path, model_dir: Path) -> list[str]:
    return [
        "scripts/meta-progression-report.sh",
        "--default",
        "--checkpoint-dir",
        str(checkpoint_dir),
        "--output",
        str(output_path),
    ]


def _meta_report_quick(output_path: Path, checkpoint_dir: Path, model_dir: Path) -> list[str]:
    return [
        "scripts/meta-progression-report.sh",
        "--quick",
        "--checkpoint-dir",
        str(checkpoint_dir),
        "--output",
        str(output_path),
    ]


def _sweep_quick(output_path: Path, checkpoint_dir: Path, model_dir: Path) -> list[str]:
    return [
        "scripts/meta-progression-report.sh",
        "--default",
        "--player-profile",
        "expert-human",
        "--policy-set",
        "focused",
        "--campaigns",
        "6",
        "--runs",
        "80",
        "--max-pressure",
        "80",
        "--trial-seconds",
        "720",
        "--max-seconds",
        "180",
        "--checkpoint-dir",
        str(checkpoint_dir),
        "--output",
        str(output_path),
    ]


def _sweep_check(output_path: Path, checkpoint_dir: Path, model_dir: Path) -> list[str]:
    return [
        "scripts/meta-progression-report.sh",
        "--default",
        "--player-profile",
        "skilled",
        "--policy-set",
        "focused",
        "--campaigns",
        "12",
        "--runs",
        "120",
        "--max-pressure",
        "80",
        "--trial-seconds",
        "720",
        "--max-seconds",
        "360",
        "--check-target",
        "balance",
        "--checkpoint-dir",
        str(checkpoint_dir),
        "--output",
        str(output_path),
    ]


def _phase_quick(stage: str) -> Callable[[Path, Path, Path], list[str]]:
    def _build(output_path: Path, checkpoint_dir: Path, model_dir: Path) -> list[str]:
        return [
            "scripts/meta-progression-report.sh",
            "--default",
            "--phase",
            stage,
            "--player-profile",
            "expert-human",
            "--policy-set",
            "focused",
            "--campaigns",
            "6",
            "--runs",
            "80",
            "--max-pressure",
            "80",
            "--trial-seconds",
            "720",
            "--max-seconds",
            "180",
            "--checkpoint-dir",
            str(checkpoint_dir),
            "--output",
            str(output_path),
        ]

    return _build


def _rl_train_baseline(output_path: Path, checkpoint_dir: Path, model_dir: Path) -> list[str]:
    return ["scripts/balance-rl-train-baseline.sh", "--model-dir", str(model_dir)]


def _rl_report(mode: str) -> Callable[[Path, Path, Path], list[str]]:
    def _build(output_path: Path, checkpoint_dir: Path, model_dir: Path) -> list[str]:
        cmd = ["scripts/balance-rl-report.sh"]
        if mode:
            cmd.append(mode)
        cmd.extend(["--model-dir", str(model_dir), "--output", str(output_path)])
        return cmd

    return _build


def _rl_smoke(output_path: Path, checkpoint_dir: Path, model_dir: Path) -> list[str]:
    return ["scripts/balance-rl-smoke.sh"]


COMMANDS: dict[str, Callable[[Path, Path, Path], list[str]]] = {
    "meta-report": _meta_report,
    "meta-report-quick": _meta_report_quick,
    "profile": lambda output, checkpoint, model: _base_report_command(output, checkpoint),
    "profile-quick": _profile_quick,
    "profile-check": _profile_check,
    "sweep-quick": _sweep_quick,
    "sweep-check": _sweep_check,
    "phase2-quick": _phase_quick("stage2"),
    "phase3-quick": _phase_quick("stage3"),
    "rl-train-baseline": _rl_train_baseline,
    "rl-report-quick": _rl_report("--quick"),
    "rl-report": _rl_report(""),
    "rl-check": _rl_report("--check"),
    "rl-smoke": _rl_smoke,
}

GPU_COMMANDS = {"rl-train-baseline"}
SMOKE_COMMANDS = {"rl-smoke"}
BIG_CPU_COMMANDS = {"profile", "profile-check", "sweep-check", "rl-report", "rl-check"}
RESERVED_REMOTE_ARGS = {"--output", "--model-dir", "--checkpoint-dir"}

COMMAND_TIMEOUT_SECONDS = {
    "meta-report": 60 * 60 * 4 - 120,
    "meta-report-quick": 60 * 45,
    "profile": 60 * 60 * 4 - 120,
    "profile-quick": 60 * 45,
    "profile-check": 60 * 60 * 4 - 120,
    "sweep-quick": 60 * 60 * 2,
    "sweep-check": 60 * 60 * 4 - 120,
    "phase2-quick": 60 * 60 * 2,
    "phase3-quick": 60 * 60 * 2,
    "rl-train-baseline": 60 * 60 * 6 - 120,
    "rl-report-quick": 60 * 60 * 2,
    "rl-report": 60 * 60 * 4 - 120,
    "rl-check": 60 * 60 * 4 - 120,
    "rl-smoke": 60 * 45 - 60,
}


def _validate_extra_args(extra_args: list[str]) -> None:
    for arg in extra_args:
        if arg in RESERVED_REMOTE_ARGS or any(arg.startswith(f"{reserved}=") for reserved in RESERVED_REMOTE_ARGS):
            raise ValueError(
                f"{arg} is managed by the Modal runner; force VOIDLINE_BALANCE_BACKEND=local to override it"
            )


def _option_name(arg: str) -> str | None:
    if not arg.startswith("--"):
        return None
    return arg.split("=", 1)[0]


def _override_args_present(extra_args: list[str]) -> set[str]:
    present: set[str] = set()
    for arg in extra_args:
        option = _option_name(arg)
        if option is not None:
            present.add(option)
    return present


def _merge_extra_args(argv: list[str], extra_args: list[str]) -> list[str]:
    overrides = _override_args_present(extra_args)
    if not overrides:
        return [*argv, *extra_args]

    merged: list[str] = []
    index = 0
    while index < len(argv):
        arg = argv[index]
        option = _option_name(arg)
        if option in overrides:
            if "=" not in arg and index + 1 < len(argv) and not argv[index + 1].startswith("--"):
                index += 2
            else:
                index += 1
            continue
        merged.append(arg)
        index += 1
    return [*merged, *extra_args]


def _write_metadata(
    artifact_dir: Path,
    *,
    command: str,
    argv: list[str],
    git_sha: str,
    balance_hash: str,
    run_id: str,
    resource_class: str,
    timeout_seconds: int,
) -> None:
    payload = {
        "schemaVersion": 1,
        "command": command,
        "argv": argv,
        "gitSha": git_sha,
        "balanceHash": balance_hash,
        "runId": run_id,
        "resourceClass": resource_class,
        "timeoutSeconds": timeout_seconds,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    (artifact_dir / "metadata.json").write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def _run_command(
    command: str,
    extra_args_json: str,
    git_sha: str,
    balance_hash: str,
    run_id: str,
    resource_class: str,
) -> dict[str, object]:
    if command not in COMMANDS:
        raise ValueError(f"unknown balance command: {command}")
    extra_args = json.loads(extra_args_json)
    if not isinstance(extra_args, list) or not all(isinstance(item, str) for item in extra_args):
        raise ValueError("extra_args_json must be a JSON string array")
    _validate_extra_args(extra_args)

    artifact_dir = REPORT_ROOT / balance_hash / command / run_id
    artifact_dir.mkdir(parents=True, exist_ok=True)
    checkpoint_dir = REPORT_ROOT / balance_hash / "checkpoints"
    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    model_dir = MODEL_ROOT / balance_hash
    model_dir.mkdir(parents=True, exist_ok=True)

    output_path = artifact_dir / f"{command}.json"
    argv = _merge_extra_args(COMMANDS[command](output_path, checkpoint_dir, model_dir), extra_args)
    if argv and argv[0].startswith("scripts/"):
        argv = ["bash", *argv]
    timeout_seconds = int(os.environ.get("VOIDLINE_BALANCE_JOB_TIMEOUT_SECONDS", COMMAND_TIMEOUT_SECONDS[command]))
    timeout_argv = ["timeout", "--kill-after=60s", f"{timeout_seconds}s", *argv]
    env = os.environ.copy()
    env["VOIDLINE_RL_MODEL_DIR"] = str(model_dir)
    if command == "rl-smoke":
        env["VOIDLINE_RL_SMOKE_MODEL_DIR"] = str(model_dir / "smoke")
    env["VOIDLINE_RL_SYSTEM_PYTHON"] = "1"
    env["PYTHONPATH"] = f"{REMOTE_REPO / 'sim' / 'training'}:{env.get('PYTHONPATH', '')}".rstrip(":")
    env["RAYON_NUM_THREADS"] = env.get("RAYON_NUM_THREADS", "64")
    env["CARGO_HOME"] = str(CACHE_ROOT / "cargo-home")
    env["CARGO_TARGET_DIR"] = str(CACHE_ROOT / "cargo-target")
    env["UV_CACHE_DIR"] = str(CACHE_ROOT / "uv")

    _write_metadata(
        artifact_dir,
        command=command,
        argv=timeout_argv,
        git_sha=git_sha,
        balance_hash=balance_hash,
        run_id=run_id,
        resource_class=resource_class,
        timeout_seconds=timeout_seconds,
    )
    subprocess.run(timeout_argv, cwd=REMOTE_REPO, env=env, check=True)

    if command == "rl-smoke":
        smoke_output = REMOTE_REPO / "scripts" / "balance-rl-smoke-report.json"
        if smoke_output.exists():
            shutil.copy2(smoke_output, output_path)

    reports_volume.commit()
    if command in GPU_COMMANDS or command.startswith("rl-"):
        models_volume.commit()
    cache_volume.commit()
    return {
        "command": command,
        "gitSha": git_sha,
        "balanceHash": balance_hash,
        "runId": run_id,
        "artifactDir": str(artifact_dir),
        "modelDir": str(model_dir),
        "output": str(output_path),
        "resourceClass": resource_class,
        "timeoutSeconds": timeout_seconds,
    }


@app.function(
    image=image,
    volumes={"/reports": reports_volume, "/models": models_volume, str(CACHE_ROOT): cache_volume},
    cpu=32,
    memory=65536,
    timeout=60 * 60 * 4,
)
def run_balance_cpu(command: str, extra_args_json: str, git_sha: str, balance_hash: str, run_id: str) -> dict[str, object]:
    return _run_command(command, extra_args_json, git_sha, balance_hash, run_id, "cpu-burst")


@app.function(
    image=image,
    volumes={"/reports": reports_volume, "/models": models_volume, str(CACHE_ROOT): cache_volume},
    cpu=64,
    memory=131072,
    timeout=60 * 60 * 4,
)
def run_balance_big_cpu(command: str, extra_args_json: str, git_sha: str, balance_hash: str, run_id: str) -> dict[str, object]:
    return _run_command(command, extra_args_json, git_sha, balance_hash, run_id, "big-cpu-burst")


@app.function(
    image=image,
    volumes={"/reports": reports_volume, "/models": models_volume, str(CACHE_ROOT): cache_volume},
    cpu=32,
    memory=131072,
    gpu="H100",
    timeout=60 * 60 * 6,
)
def run_balance_gpu(command: str, extra_args_json: str, git_sha: str, balance_hash: str, run_id: str) -> dict[str, object]:
    return _run_command(command, extra_args_json, git_sha, balance_hash, run_id, "h100-burst")


@app.function(
    image=image,
    volumes={"/reports": reports_volume, "/models": models_volume, str(CACHE_ROOT): cache_volume},
    cpu=4,
    memory=16384,
    timeout=60 * 45,
)
def run_balance_smoke(command: str, extra_args_json: str, git_sha: str, balance_hash: str, run_id: str) -> dict[str, object]:
    return _run_command(command, extra_args_json, git_sha, balance_hash, run_id, "smoke")


@app.local_entrypoint()
def main(command: str, extra_args_json: str = "[]", git_sha: str = "unknown", balance_hash: str = "unknown", run_id: str = "manual") -> None:
    if command not in COMMANDS:
        raise SystemExit(f"unknown balance command: {command}")

    if command in GPU_COMMANDS:
        result = run_balance_gpu.remote(command, extra_args_json, git_sha, balance_hash, run_id)
    elif command in SMOKE_COMMANDS:
        result = run_balance_smoke.remote(command, extra_args_json, git_sha, balance_hash, run_id)
    elif command in BIG_CPU_COMMANDS:
        result = run_balance_big_cpu.remote(command, extra_args_json, git_sha, balance_hash, run_id)
    else:
        result = run_balance_cpu.remote(command, extra_args_json, git_sha, balance_hash, run_id)

    print(json.dumps(result, indent=2))
