// SSOT loader: prompt-spec.json から全設定値を供給する
// Rust側の PROMPT_SPEC + accessor 関数に相当
import spec from '../prompt-spec.json';
import {
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
  height: HeightRange;
  fillRatioL: Range;
  fillRatioW: Range;
  fillRatioZ: Range;
  packingDensity: Range;
}

// --- Strategy resolution (v2.0.0) ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const activeStrategy = (spec.strategies as any)[spec.activeStrategy];

// アクセサ (active strategy → 既存コードの互換エクスポート)
export const jsonTemplate = activeStrategy.jsonTemplate;
export const ranges = activeStrategy.ranges as Ranges;
export const rangeGuide = activeStrategy.rangeGuide as string;
export const promptFormat = spec.promptFormat;
export const materials = spec.materials as Record<string, MaterialEntry>;
export const truckSpecs = spec.truckSpecs as Record<string, TruckSpecEntry>;
// calculation: v2で廃止。4tトラック荷台面積をデフォルトとする
const _4t = truckSpecs['4t'];
export const calculation = { defaultBedAreaM2: _4t ? _4t.bedLength * _4t.bedWidth : 6.8 };

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

// クランプ: AI応答値をranges範囲内に強制
export function clampToRanges(result: Record<string, unknown>): void {
  for (const [key, range] of Object.entries(activeStrategy.ranges as Record<string, Range>)) {
    if (typeof result[key] === 'number') {
      result[key] = Math.min(Math.max(result[key] as number, range.min), range.max);
    }
  }
}

// --- WASM integration ---
// Note: WASM module is initialized by calculation.ts's initWasm(), called from index.tsx.
// Once initialized, wasmBuildCorePrompt() is available without separate init here.
let _cachedPrompt: string | null = null;

export function buildCorePrompt(): string {
  if (_cachedPrompt !== null) return _cachedPrompt;
  try {
    _cachedPrompt = wasmBuildCorePrompt();
    return _cachedPrompt;
  } catch {
    // Fallback: JS implementation (used before WASM init completes)
    return spec.promptFormat
      .replaceAll('{jsonTemplate}', JSON.stringify(activeStrategy.jsonTemplate))
      .replaceAll('{rangeGuide}', activeStrategy.rangeGuide as string);
  }
}
