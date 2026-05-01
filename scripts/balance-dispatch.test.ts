import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const dispatchScript = path.join(repoRoot, "scripts", "balance-dispatch.sh");

function runDispatch(args: string[], env: NodeJS.ProcessEnv = {}): string {
  return execFileSync(dispatchScript, args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      MODAL_TOKEN_ID: "",
      MODAL_TOKEN_SECRET: "",
      VOIDLINE_BALANCE_BACKEND: "",
      ...env,
    },
  });
}

function envWithFakeUvx(env: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const binDir = mkdtempSync(path.join(tmpdir(), "voidline-modal-bin-"));
  const uvxPath = path.join(binDir, "uvx");
  writeFileSync(uvxPath, "#!/usr/bin/env sh\nexit 0\n");
  chmodSync(uvxPath, 0o755);
  return {
    ...env,
    PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
  };
}

describe("balance dispatcher", () => {
  it("uses local backend when explicitly requested", () => {
    const output = runDispatch(["profile-check", "--dry-run"], {
      VOIDLINE_BALANCE_BACKEND: "local",
    });

    expect(output).toContain("backend=local");
    expect(output).toContain("command=profile-check");
    expect(output).toContain("balance-profile.sh --check");
  });

  it("uses Modal when credentials are available", () => {
    const output = runDispatch(["profile-quick", "--dry-run"], envWithFakeUvx({
      MODAL_TOKEN_ID: "token-id",
      MODAL_TOKEN_SECRET: "token-secret",
    }));

    expect(output).toContain("backend=modal");
    expect(output).toContain("modal_app=voidline-balance");
    expect(output).toContain("modal_command=profile-quick");
  });

  it("uses Modal when config file has active tokens", () => {
    const home = mkdtempSync(path.join(tmpdir(), "voidline-modal-home-"));
    const configPath = path.join(home, ".modal.toml");
    writeFileSync(configPath, "[default]\ntoken_id = \"token-id\"\ntoken_secret = \"token-secret\"\n");
    const output = runDispatch(["profile-quick", "--dry-run"], envWithFakeUvx({
      HOME: home,
      MODAL_CONFIG_PATH: configPath,
    }));

    expect(output).toContain("backend=modal");
    expect(output).toContain("modal_command=profile-quick");
  });

  it("falls back locally when credentials are absent", () => {
    const home = mkdtempSync(path.join(tmpdir(), "voidline-modal-home-"));
    const output = runDispatch(["sweep-check", "--dry-run"], {
      HOME: home,
      MODAL_CONFIG_PATH: path.join(home, ".modal.toml"),
    });

    expect(output).toContain("backend=local");
    expect(output).toContain("command=sweep-check");
    expect(output).toContain("meta-progression-report.sh");
  });

  it("falls back locally when Modal config lacks tokens", () => {
    const home = mkdtempSync(path.join(tmpdir(), "voidline-modal-home-"));
    const configPath = path.join(home, ".modal.toml");
    writeFileSync(configPath, "[default]\n# token_id = \"commented\"\n# token_secret = \"commented\"\n");
    const output = runDispatch(["profile-quick", "--dry-run"], envWithFakeUvx({
      HOME: home,
      MODAL_CONFIG_PATH: configPath,
    }));

    expect(output).toContain("backend=local");
    expect(output).toContain("balance-profile.sh --quick");
  });

  it("rejects commands outside the allowlist", () => {
    const result = spawnSync(dispatchScript, ["shell", "--dry-run"], {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        VOIDLINE_BALANCE_BACKEND: "local",
      },
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("unknown balance command: shell");
  });
});
