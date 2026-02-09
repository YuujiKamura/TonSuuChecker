// SSOT loader: prompt-spec.json から全設定値を供給する
// v2.1.0: strategies廃止、ranges/constants がトップレベル
import spec from '../prompt-spec.json';

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
  taperRatio: Range;
  packingDensity: Range;
  fillRatioZ: Range; // legacy backward compat
}

// アクセサ (v2.1.0: トップレベルから直接取得)
export const ranges = spec.ranges as Ranges;
export const materials = spec.materials as Record<string, MaterialEntry>;
export const truckSpecs = spec.truckSpecs as Record<string, TruckSpecEntry>;
export const constants = spec.constants;

// multi-param strategy prompts (used by CLI/legacy analysis)
export const multiParamPrompt = spec.multiParamPrompt;
export const jsonTemplate = multiParamPrompt.jsonTemplate;
export const rangeGuide = multiParamPrompt.rangeGuide;
export const promptFormat = multiParamPrompt.promptFormat;

// 4tトラック荷台面積をデフォルトとする
const _4t = truckSpecs['4t'];
export const calculation = { defaultBedAreaM2: _4t ? _4t.bedLength * _4t.bedWidth : 6.8 };

// ヘルパー
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
  for (const [key, range] of Object.entries(spec.ranges as Record<string, Range>)) {
    if (typeof result[key] === 'number') {
      result[key] = Math.min(Math.max(result[key] as number, range.min), range.max);
    }
  }
}

// buildCorePrompt: multi-param strategy用 (WASM不要、JSで構築)
let _cachedPrompt: string | null = null;

export function buildCorePrompt(): string {
  if (_cachedPrompt !== null) return _cachedPrompt;
  _cachedPrompt = multiParamPrompt.promptFormat
    .replaceAll('{jsonTemplate}', JSON.stringify(multiParamPrompt.jsonTemplate))
    .replaceAll('{rangeGuide}', multiParamPrompt.rangeGuide);
  return _cachedPrompt;
}
