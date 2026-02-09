/* tslint:disable */
/* eslint-disable */

export function calculateTonnage(height: number, fill_ratio_l: number, fill_ratio_w: number, taper_ratio: number, packing_density: number, material_type: string, truck_class?: string | null): string;

export function getFillPrompt(): string;

export function getGeometryPrompt(): string;

export function heightFromGeometry(tg_top: number, tg_bot: number, cargo_top: number, plate_box_json: string | null | undefined, bed_height: number): string;

export function parseFill(text: string): string;

export function parseGeometry(text: string): string;

export function validateParams(json: string): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly calculateTonnage: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number];
    readonly heightFromGeometry: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly getFillPrompt: () => [number, number];
    readonly getGeometryPrompt: () => [number, number];
    readonly parseFill: (a: number, b: number) => [number, number];
    readonly parseGeometry: (a: number, b: number) => [number, number];
    readonly validateParams: (a: number, b: number) => [number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
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
