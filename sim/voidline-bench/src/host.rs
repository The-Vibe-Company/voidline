use anyhow::{anyhow, Context, Result};
use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::{json, Value};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::{Mutex, OnceLock};

use voidline_bot::{GameoverSummary, MetaLevels, ShopState, Snapshot};

static HOST_INSTALL_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

pub struct Host {
    child: Child,
    stdin: ChildStdin,
    stdout: ChildStdout,
}

impl Host {
    pub fn spawn(seed: u64) -> Result<Self> {
        let host_dir = host_dir()?;
        ensure_host_dependencies(&host_dir)?;
        let mut child = Command::new("npm")
            .args(["run", "start", "--silent"])
            .current_dir(&host_dir)
            .env("VOIDLINE_SEED", seed.to_string())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .with_context(|| format!("failed to spawn headless host in {}", host_dir.display()))?;
        let stdin = child.stdin.take().context("host stdin missing")?;
        let stdout = child.stdout.take().context("host stdout missing")?;
        Ok(Self {
            child,
            stdin,
            stdout,
        })
    }

    pub fn init(&mut self, seed: u64, meta_levels: &MetaLevels) -> Result<Snapshot> {
        self.call("init", json!({ "seed": seed, "metaLevels": meta_levels.0 }))
    }

    pub fn tick(&mut self, dt: f64, pointer_x: f64, pointer_y: f64) -> Result<Snapshot> {
        self.call(
            "tick",
            json!({ "dt": dt, "pointerX": pointer_x, "pointerY": pointer_y }),
        )
    }

    pub fn shop_state(&mut self) -> Result<ShopState> {
        self.call("shop_state", json!({}))
    }

    pub fn buy(&mut self, idx: usize) -> Result<bool> {
        let value: Value = self.call("buy", json!({ "idx": idx }))?;
        Ok(value.get("ok").and_then(Value::as_bool).unwrap_or(false))
    }

    pub fn reroll(&mut self) -> Result<bool> {
        let value: Value = self.call("reroll", json!({}))?;
        Ok(value.get("ok").and_then(Value::as_bool).unwrap_or(false))
    }

    pub fn next_wave(&mut self) -> Result<Snapshot> {
        self.call("next_wave", json!({}))
    }

    pub fn gameover_summary(&mut self) -> Result<GameoverSummary> {
        self.call("gameover_summary", json!({}))
    }

    fn call<T: DeserializeOwned>(&mut self, cmd: &str, payload: Value) -> Result<T> {
        write_frame(&mut self.stdin, &json!({ "cmd": cmd, "payload": payload }))?;
        let value = read_frame(&mut self.stdout)?;
        if let Some(error) = value.get("error").and_then(Value::as_str) {
            return Err(anyhow!("host error on {cmd}: {error}"));
        }
        serde_json::from_value(value)
            .with_context(|| format!("failed to decode host response for {cmd}"))
    }
}

impl Drop for Host {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn write_frame<W: Write, T: Serialize>(writer: &mut W, payload: &T) -> Result<()> {
    let body = serde_json::to_vec(payload)?;
    let len = u32::try_from(body.len()).context("frame too large")?;
    writer.write_all(&len.to_le_bytes())?;
    writer.write_all(&body)?;
    writer.flush()?;
    Ok(())
}

fn read_frame<R: Read>(reader: &mut R) -> Result<Value> {
    let mut header = [0_u8; 4];
    reader
        .read_exact(&mut header)
        .context("host closed before frame header")?;
    let len = u32::from_le_bytes(header) as usize;
    let mut body = vec![0_u8; len];
    reader
        .read_exact(&mut body)
        .context("host closed before frame body")?;
    serde_json::from_slice(&body).context("invalid JSON frame from host")
}

fn host_dir() -> Result<PathBuf> {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let dir = manifest.join("../headless-host").canonicalize()?;
    Ok(dir)
}

fn ensure_host_dependencies(host_dir: &std::path::Path) -> Result<()> {
    if host_dir.join("node_modules/.bin/tsx").exists() {
        return Ok(());
    }
    let _guard = HOST_INSTALL_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .expect("host install lock poisoned");
    if host_dir.join("node_modules/.bin/tsx").exists() {
        return Ok(());
    }
    let status = Command::new("npm")
        .args(["install", "--silent"])
        .current_dir(host_dir)
        .status()
        .with_context(|| {
            format!(
                "failed to install headless host dependencies in {}",
                host_dir.display()
            )
        })?;
    if !status.success() {
        return Err(anyhow!(
            "npm install failed for headless host in {}",
            host_dir.display()
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use voidline_bot::SCHEMA_VERSION;

    #[test]
    fn host_contract_exercises_core_rpc() {
        let mut host = Host::spawn(123).expect("host should spawn");
        let snapshot = host
            .init(123, &MetaLevels::default())
            .expect("init should return snapshot");
        assert_eq!(snapshot.schema_version, SCHEMA_VERSION);
        assert_eq!(snapshot.mode, "playing");
        assert_eq!(snapshot.wave, 1);

        let ticked = host
            .tick(1.0 / 60.0, snapshot.player.x + 1000.0, snapshot.player.y)
            .expect("tick should return snapshot");
        assert_eq!(ticked.schema_version, SCHEMA_VERSION);
        assert_eq!(ticked.mode, "playing");

        let shop = host.shop_state().expect("shop_state should return shape");
        assert_eq!(shop.schema_version, SCHEMA_VERSION);
        assert!(!host
            .buy(0)
            .expect("buy should return a boolean outside shop"));
        assert!(!host
            .reroll()
            .expect("reroll should return a boolean without currency"));

        let summary = host
            .gameover_summary()
            .expect("gameover_summary should return summary");
        assert_eq!(summary.schema_version, SCHEMA_VERSION);
    }
}
