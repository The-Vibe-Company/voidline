/* tslint:disable */
/* eslint-disable */

export class WasmEngine {
    free(): void;
    [Symbol.dispose](): void;
    applyRelic(relic_id: string): void;
    applyUpgrade(upgrade_id: string, tier_id: string): void;
    draftRelics(count: number): any;
    draftUpgrades(count: number): any;
    constructor(balance_json: string, config: any);
    reset(seed: number | null | undefined, account: any): void;
    resize(width: number, height: number, dpr: number): void;
    seedStress(config: any): void;
    setInput(input: any): void;
    snapshot(): any;
    startWave(wave: number): void;
    step(dt: number): void;
    updateAccount(account: any): void;
}

export function applyRunReward(progress: any, summary: any): any;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_wasmengine_free: (a: number, b: number) => void;
    readonly applyRunReward: (a: any, b: any) => [number, number, number];
    readonly wasmengine_applyRelic: (a: number, b: number, c: number) => [number, number];
    readonly wasmengine_applyUpgrade: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly wasmengine_draftRelics: (a: number, b: number) => [number, number, number];
    readonly wasmengine_draftUpgrades: (a: number, b: number) => [number, number, number];
    readonly wasmengine_new: (a: number, b: number, c: any) => [number, number, number];
    readonly wasmengine_reset: (a: number, b: number, c: any) => [number, number];
    readonly wasmengine_resize: (a: number, b: number, c: number, d: number) => void;
    readonly wasmengine_seedStress: (a: number, b: any) => [number, number];
    readonly wasmengine_setInput: (a: number, b: any) => [number, number];
    readonly wasmengine_snapshot: (a: number) => [number, number, number];
    readonly wasmengine_startWave: (a: number, b: number) => void;
    readonly wasmengine_step: (a: number, b: number) => void;
    readonly wasmengine_updateAccount: (a: number, b: any) => [number, number];
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
