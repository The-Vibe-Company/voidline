from __future__ import annotations

import json
import os
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import modal


APP_NAME = "voidline-balance"
REMOTE_REPO = Path("/workspace/voidline")
REPORT_ROOT = Path("/reports")
MODEL_ROOT = Path("/models")
CACHE_ROOT = Path("/mnt/voidline-cache")
PERSONAS = ("oracle",)


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

COMMAND_TIMEOUT_SECONDS = {
    "quick": 60 * 15,
    "full": 60 * 60 * 4 - 120,
    "train": 60 * 60 * 6 - 120,
    "test-card": 60 * 20,
}

RESERVED_REMOTE_ARGS = {"--output", "--model-dir", "--checkpoint-dir", "--repo-root"}


def _validate_extra_args(extra_args: list[str]) -> None:
    for arg in extra_args:
        if arg in RESERVED_REMOTE_ARGS or any(arg.startswith(f"{reserved}=") for reserved in RESERVED_REMOTE_ARGS):
            raise ValueError(f"{arg} is managed by the Modal runner")


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


def _run_timeout(argv: list[str], env: dict[str, str], command: str) -> list[str]:
    timeout_seconds = int(os.environ.get("VOIDLINE_BALANCE_JOB_TIMEOUT_SECONDS", COMMAND_TIMEOUT_SECONDS[command]))
    timeout_argv = ["timeout", "--kill-after=60s", f"{timeout_seconds}s", *argv]
    subprocess.run(timeout_argv, cwd=REMOTE_REPO, env=env, check=True)
    return timeout_argv


def _base_env(model_dir: Path) -> dict[str, str]:
    env = os.environ.copy()
    env["VOIDLINE_RL_MODEL_DIR"] = str(model_dir)
    env["VOIDLINE_RL_SYSTEM_PYTHON"] = "1"
    env["PYTHONPATH"] = f"{REMOTE_REPO / 'sim' / 'training'}:{env.get('PYTHONPATH', '')}".rstrip(":")
    env["RAYON_NUM_THREADS"] = env.get("RAYON_NUM_THREADS", "64")
    env["CARGO_HOME"] = str(CACHE_ROOT / "cargo-home")
    env["CARGO_TARGET_DIR"] = str(CACHE_ROOT / "cargo-target")
    env["UV_CACHE_DIR"] = str(CACHE_ROOT / "uv")
    return env


def _build_voidline_py(env: dict[str, str]) -> None:
    wheel_dir = Path("/tmp/voidline-py-wheel")
    shutil.rmtree(wheel_dir, ignore_errors=True)
    wheel_dir.mkdir(parents=True, exist_ok=True)

    # The persistent cargo cache volume can hold stale .so artefacts past
    # mtime-based fingerprinting (see scripts/meta-progression-report.sh for
    # the same issue on the CLI binary). `cargo clean -p` proved unreliable
    # because maturin's cdylib output is in `target/release/` rather than
    # the per-package layout cargo expects. The nuclear option (wipe the
    # release tree once per marker bump) is fast in practice and only fires
    # when this constant changes.
    rebuild_marker_value = "20260501f-oracle-iter1"
    cargo_target = Path(env.get("CARGO_TARGET_DIR", str(REMOTE_REPO / "sim" / "target")))
    marker = cargo_target / ".voidline-rebuild-marker-py"
    cargo_target.mkdir(parents=True, exist_ok=True)
    current = marker.read_text(encoding="utf-8") if marker.exists() else ""
    if current.strip() != rebuild_marker_value:
        for victim in (cargo_target / "release", cargo_target / "debug"):
            try:
                shutil.rmtree(victim)
            except FileNotFoundError:
                pass
        marker.write_text(rebuild_marker_value + "\n", encoding="utf-8")

    subprocess.run(
        [
            "maturin",
            "build",
            "--release",
            "--manifest-path",
            str(REMOTE_REPO / "sim" / "crates" / "voidline-py" / "Cargo.toml"),
            "--out",
            str(wheel_dir),
        ],
        cwd=REMOTE_REPO,
        env=env,
        check=True,
    )
    wheels = sorted(wheel_dir.glob("voidline_py-*.whl"))
    if not wheels:
        raise RuntimeError("maturin did not produce a voidline_py wheel")
    subprocess.run(["python3", "-m", "pip", "install", "--force-reinstall", str(wheels[-1])], env=env, check=True)


def _require_models(model_dir: Path) -> None:
    missing = [
        persona
        for persona in PERSONAS
        if not (model_dir / f"{persona}.zip").is_file()
    ]
    if missing:
        joined = ", ".join(f"{persona}.zip" for persona in missing)
        raise RuntimeError(f"missing RL model(s): {joined}; run `npm run balance:train` first")


def _oracle_args(
    mode: str,
    model_dir: Path,
    output_path: Path,
    target_upgrade_id: str | None = None,
) -> list[str]:
    """Single oracle eval entry point — replaces the legacy heuristic +
    learned report split.
    """
    base = [
        "python3",
        "-m",
        "voidline_rl.eval",
        "--repo-root",
        str(REMOTE_REPO),
        "--model-dir",
        str(model_dir),
        "--output",
        str(output_path),
        "--mode",
        mode,
    ]
    if target_upgrade_id is not None:
        base.extend(["--target-upgrade-id", target_upgrade_id])
    return base


def _write_metadata(
    artifact_dir: Path,
    *,
    command: str,
    argv: list[list[str]],
    git_sha: str,
    balance_hash: str,
    run_id: str,
    resource_class: str,
) -> None:
    payload = {
        "schemaVersion": 1,
        "command": command,
        "argv": argv,
        "gitSha": git_sha,
        "balanceHash": balance_hash,
        "runId": run_id,
        "resourceClass": resource_class,
        "timeoutSeconds": COMMAND_TIMEOUT_SECONDS[command],
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    (artifact_dir / "metadata.json").write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def _run_report(
    command: str,
    extra_args: list[str],
    artifact_dir: Path,
    _checkpoint_dir: Path,
    model_dir: Path,
    env: dict[str, str],
    target_upgrade_id: str | None = None,
) -> tuple[dict[str, object], list[list[str]]]:
    """Run a single oracle eval and write the canonical report.

    The legacy heuristic + learned split was retired with the oracle RL
    rewrite — both signals now flow through one ``voidline_rl.eval`` run.
    """
    _require_models(model_dir)
    _build_voidline_py(env)

    output_path = artifact_dir / f"{command}.json"
    argv = _merge_extra_args(
        _oracle_args(command, model_dir, output_path, target_upgrade_id),
        extra_args,
    )
    executed = [_run_timeout(argv, env, command)]
    payload = json.loads(output_path.read_text(encoding="utf-8"))
    return payload, executed


def _run_train(extra_args: list[str], artifact_dir: Path, model_dir: Path, env: dict[str, str]) -> tuple[dict[str, object], list[list[str]]]:
    _build_voidline_py(env)
    output_path = artifact_dir / "train.json"
    argv = _merge_extra_args(
        [
            "python3",
            "-m",
            "voidline_rl.train",
            "--persona",
            "all",
            "--model-dir",
            str(model_dir),
        ],
        extra_args,
    )
    executed = [_run_timeout(argv, env, "train")]
    models = sorted(path.name for path in model_dir.glob("*.onnx"))
    payload = {"schemaVersion": 1, "mode": "train", "modelDir": str(model_dir), "models": models}
    output_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return payload, executed


def _run_command(
    command: str,
    extra_args_json: str,
    git_sha: str,
    balance_hash: str,
    run_id: str,
    resource_class: str,
) -> dict[str, object]:
    if command not in {"quick", "full", "train", "test-card"}:
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
    env = _base_env(model_dir)

    if command == "train":
        payload, executed = _run_train(extra_args, artifact_dir, model_dir, env)
    else:
        # `--target-upgrade-id <id>` is allowed in extra_args for test-card.
        target_upgrade_id: str | None = None
        cleaned_extras: list[str] = []
        skip_next = False
        for idx, arg in enumerate(extra_args):
            if skip_next:
                skip_next = False
                continue
            if arg == "--target-upgrade-id" and idx + 1 < len(extra_args):
                target_upgrade_id = extra_args[idx + 1]
                skip_next = True
                continue
            if arg.startswith("--target-upgrade-id="):
                target_upgrade_id = arg.split("=", 1)[1]
                continue
            cleaned_extras.append(arg)
        payload, executed = _run_report(
            command,
            cleaned_extras,
            artifact_dir,
            checkpoint_dir,
            model_dir,
            env,
            target_upgrade_id=target_upgrade_id,
        )

    _write_metadata(
        artifact_dir,
        command=command,
        argv=executed,
        git_sha=git_sha,
        balance_hash=balance_hash,
        run_id=run_id,
        resource_class=resource_class,
    )
    reports_volume.commit()
    if command == "train":
        models_volume.commit()
    cache_volume.commit()
    return {
        "command": command,
        "gitSha": git_sha,
        "balanceHash": balance_hash,
        "runId": run_id,
        "artifactDir": str(artifact_dir),
        "modelDir": str(model_dir),
        "output": str(artifact_dir / f"{command}.json"),
        "resourceClass": resource_class,
        "timeoutSeconds": COMMAND_TIMEOUT_SECONDS[command],
        "flagCount": sum(len(value) for value in payload.get("flags", {}).values()) if isinstance(payload.get("flags"), dict) else 0,
    }


@app.function(
    image=image,
    volumes={"/reports": reports_volume, "/models": models_volume, str(CACHE_ROOT): cache_volume},
    cpu=32,
    memory=65536,
    timeout=60 * 20,
)
def run_balance_quick(command: str, extra_args_json: str, git_sha: str, balance_hash: str, run_id: str) -> dict[str, object]:
    return _run_command(command, extra_args_json, git_sha, balance_hash, run_id, "cpu-burst")


@app.function(
    image=image,
    volumes={"/reports": reports_volume, "/models": models_volume, str(CACHE_ROOT): cache_volume},
    cpu=64,
    memory=131072,
    timeout=60 * 60 * 4,
)
def run_balance_full(command: str, extra_args_json: str, git_sha: str, balance_hash: str, run_id: str) -> dict[str, object]:
    return _run_command(command, extra_args_json, git_sha, balance_hash, run_id, "big-cpu-burst")


@app.function(
    image=image,
    volumes={"/reports": reports_volume, "/models": models_volume, str(CACHE_ROOT): cache_volume},
    cpu=32,
    memory=131072,
    gpu="H100",
    timeout=60 * 60 * 6,
)
def run_balance_train(command: str, extra_args_json: str, git_sha: str, balance_hash: str, run_id: str) -> dict[str, object]:
    return _run_command(command, extra_args_json, git_sha, balance_hash, run_id, "h100-burst")


@app.function(
    image=image,
    volumes={"/reports": reports_volume, "/models": models_volume, str(CACHE_ROOT): cache_volume},
    cpu=32,
    memory=65536,
    timeout=60 * 25,
)
def run_balance_test_card(
    command: str, extra_args_json: str, git_sha: str, balance_hash: str, run_id: str
) -> dict[str, object]:
    return _run_command(command, extra_args_json, git_sha, balance_hash, run_id, "cpu-burst")


@app.local_entrypoint()
def main(command: str, extra_args_json: str = "[]", git_sha: str = "unknown", balance_hash: str = "unknown", run_id: str = "manual") -> None:
    if command == "quick":
        result = run_balance_quick.remote(command, extra_args_json, git_sha, balance_hash, run_id)
    elif command == "full":
        result = run_balance_full.remote(command, extra_args_json, git_sha, balance_hash, run_id)
    elif command == "train":
        result = run_balance_train.remote(command, extra_args_json, git_sha, balance_hash, run_id)
    elif command == "test-card":
        result = run_balance_test_card.remote(
            command, extra_args_json, git_sha, balance_hash, run_id
        )
    else:
        raise SystemExit(f"unknown balance command: {command}")

    print(json.dumps(result, indent=2))
