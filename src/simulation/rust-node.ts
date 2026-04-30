import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface RustMetaReportOptions {
  quick?: boolean;
  campaigns?: number;
  runs?: number;
  maxWave?: number;
  trialSeconds?: number;
  maxSeconds?: number;
  threads?: number;
}

export interface RustMetaReport {
  generated_at: string;
  config: Record<string, unknown>;
  policies: Array<Record<string, unknown>>;
}

export function runRustMetaReport(options: RustMetaReportOptions = {}): RustMetaReport {
  const dir = mkdtempSync(join(tmpdir(), "voidline-rust-report-"));
  const output = join(dir, "meta-progression-report.json");
  const args = [
    options.quick === true ? "--quick" : "--default",
    "--output",
    output,
  ];
  appendNumberArg(args, "--campaigns", options.campaigns);
  appendNumberArg(args, "--runs", options.runs);
  appendNumberArg(args, "--max-wave", options.maxWave);
  appendNumberArg(args, "--trial-seconds", options.trialSeconds);
  appendNumberArg(args, "--max-seconds", options.maxSeconds);
  appendNumberArg(args, "--threads", options.threads);

  const result = spawnSync("scripts/meta-progression-report.sh", args, {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  if (result.status !== 0) {
    rmSync(dir, { recursive: true, force: true });
    throw new Error(
      `Rust meta report failed (${result.status ?? "signal"}):\n${result.stderr || result.stdout}`,
    );
  }

  try {
    return JSON.parse(readFileSync(output, "utf8")) as RustMetaReport;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function runRustCampaigns(options: RustMetaReportOptions = {}): RustMetaReport {
  return runRustMetaReport(options);
}

function appendNumberArg(args: string[], name: string, value: number | undefined): void {
  if (value === undefined) return;
  args.push(name, String(value));
}
