use std::process::Command;

#[test]
fn seed_42_is_deterministic() {
    let manifest = env!("CARGO_MANIFEST_DIR");
    let first = run_seed(manifest);
    let second = run_seed(manifest);
    assert_eq!(first["waves_cleared"], second["waves_cleared"]);
    assert_eq!(first["score"], second["score"]);
    assert_eq!(first["boss10_killed"], second["boss10_killed"]);
}

fn run_seed(manifest: &str) -> serde_json::Value {
    let output = Command::new("cargo")
        .args([
            "run",
            "-q",
            "-p",
            "voidline-bench",
            "--",
            "run",
            "--seed",
            "42",
        ])
        .current_dir(std::path::Path::new(manifest).join(".."))
        .output()
        .expect("cargo run should execute");
    assert!(
        output.status.success(),
        "stderr:\n{}",
        String::from_utf8_lossy(&output.stderr)
    );
    serde_json::from_slice(&output.stdout).expect("run output should be JSON")
}
