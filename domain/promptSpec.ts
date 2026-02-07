// SSOT loader: prompt-spec.json から全設定値を供給する
// Rust側の PROMPT_SPEC + accessor 関数に相当
import spec from '../prompt-spec.json';
import wasmInit, {
  buildCorePrompt as wasmBuildCorePrompt,
} from '../lib/tonsuu-core/tonsuu_core.js';

// 型定義
export interface Range { min: number; max: number }
export interface HeightRange extends Range { step: number; calibration: { '後板': number; 'ヒンジ': number } }

export interface TruckSpecEntry {
  bedLength: number;
  bedWidth: number;
  bedHeight: number;
  levelVolume: number;
  heapVolume: number;
  maxCapacity: number;
}

export interface MaterialEntry {
  density: number;
}

export interface Ranges {
  upperArea: Range;
  height: HeightRange;
  slope: Range;
  fillRatioL: Range;
  fillRatioW: Range;
  fillRatioZ: Range;
  packingDensity: Range;
}

// アクセサ
export const jsonTemplate = spec.jsonTemplate;
export const ranges = spec.ranges as Ranges;
export const rangeGuide = spec.rangeGuide;
export const promptFormat = spec.promptFormat;
export const calculation = spec.calculation;
export const materials = spec.materials as Record<string, MaterialEntry>;
export const truckSpecs = spec.truckSpecs as Record<string, TruckSpecEntry>;

// ヘルパー
// デフォルト密度: As殻/Co殻相当（prompt-spec.json の値から取得）
const DEFAULT_DENSITY = materials['As殻']?.density ?? 2.5;

export function getMaterialDensity(name: string): number {
  return materials[name]?.density ?? DEFAULT_DENSITY;
}

export function getTruckBedArea(cls: string): number {
  const s = truckSpecs[cls];
  return s ? s.bedLength * s.bedWidth : calculation.defaultBedAreaM2;
}

// --- WASM integration ---
let _cachedCorePrompt: string | null = null;

export async function initWasm(): Promise<void> {
  if (_cachedCorePrompt !== null) return;
  await wasmInit();
  _cachedCorePrompt = wasmBuildCorePrompt();
}

export function buildCorePrompt(): string {
  if (_cachedCorePrompt !== null) return _cachedCorePrompt;
  // Fallback: JS implementation (used before WASM init)
  return spec.promptFormat
    .replaceAll('{jsonTemplate}', JSON.stringify(spec.jsonTemplate))
    .replaceAll('{rangeGuide}', spec.rangeGuide);
}
