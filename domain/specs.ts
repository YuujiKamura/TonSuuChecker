// 車両規格・素材密度は prompt-spec.json (SSOT) から取得
import { truckSpecs as specTrucks, materials as specMaterials, type TruckSpecEntry } from './promptSpec.ts';

// 車両規格マスタ（荷台寸法・容積の基準値）
export interface TruckSpec {
  maxCapacity: number;      // 最大積載量 (t)
  bedLength: number;        // 荷台長 (m)
  bedWidth: number;         // 荷台幅 (m)
  bedHeight: number;        // あおり高 (m)
  levelVolume: number;      // すり切り容量 (m³)
  heapVolume: number;       // 山盛り容量 (m³) ※係数1.3
  soilEquivalent: number;   // 土砂換算容量 (m³) ※比重1.8で計算
}

// prompt-spec.json の truckSpecs から soilEquivalent を追加計算して生成
function buildTruckSpecs(): Record<string, TruckSpec> {
  const result: Record<string, TruckSpec> = {};
  for (const [key, s] of Object.entries(specTrucks)) {
    result[key] = {
      ...s,
      soilEquivalent: Math.round(s.maxCapacity / (specMaterials['土砂']?.density ?? 1.8) * 10) / 10,
    };
  }
  return result;
}

export const TRUCK_SPECS: Record<string, TruckSpec> = buildTruckSpecs();

// 素材別密度マスタ (t/m³) - prompt-spec.json から生成 + エイリアス追加
function buildMaterialDensities(): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [name, m] of Object.entries(specMaterials)) {
    result[name] = m.density;
  }
  // エイリアス（Web UI で表記揺れに対応）
  result['アスファルトガラ'] = result['As殻'];
  result['コンクリートガラ'] = result['Co殻'];
  return result;
}

export const MATERIAL_DENSITIES: Record<string, number> = buildMaterialDensities();

// --- 以下は prompt-spec.json に無い独自データ（そのまま維持） ---

// 空隙率基準マスタ（見た目による判断用）
export const VOID_RATIOS = {
  tight: { min: 0.10, max: 0.15, desc: '細かく砕けている、締まっている' },
  normal: { min: 0.15, max: 0.20, desc: '標準的な状態' },
  loose: { min: 0.20, max: 0.30, desc: '塊が大きい、ゴロゴロしている' },
};

// 素材別空隙率マスタ（素材特性に基づく推奨値）
export const MATERIAL_VOID_RATIOS: Record<string, { typical: number; range: [number, number]; desc: string }> = {
  '土砂': { typical: 0.05, range: [0.03, 0.08], desc: '粒子が細かく締まりやすい' },
  'As殻': { typical: 0.30, range: [0.25, 0.35], desc: '塊状で隙間が多い' },
  'アスファルトガラ': { typical: 0.30, range: [0.25, 0.35], desc: '塊状で隙間が多い' },
  'Co殻': { typical: 0.30, range: [0.25, 0.35], desc: '塊状で隙間が多い' },
  'コンクリートガラ': { typical: 0.30, range: [0.25, 0.35], desc: '塊状で隙間が多い' },
  '開粒度As殻': { typical: 0.35, range: [0.30, 0.40], desc: '多孔質で空隙が特に多い' },
};

// バックホウ（油圧ショベル）バケット容量マスタ
// ※山積容量（新JIS基準: 1:1勾配）
export interface BucketSpec {
  capacity: number;      // バケット山積容量 (m³)
  machineClass: string;  // 機体クラス
  typicalWeight: number; // 土砂換算重量 (t) ※密度1.8で計算
}

export const BUCKET_SPECS: Record<string, BucketSpec> = {
  'コンマ1': { capacity: 0.1, machineClass: '3tクラス', typicalWeight: 0.15 },
  'コンマ2': { capacity: 0.2, machineClass: '5tクラス', typicalWeight: 0.29 },
  'コンマ25': { capacity: 0.25, machineClass: '7tクラス', typicalWeight: 0.36 },
  'コンマ45': { capacity: 0.45, machineClass: '12tクラス', typicalWeight: 0.65 },
  'コンマ7': { capacity: 0.7, machineClass: '20tクラス', typicalWeight: 1.0 },
  'コンマ9': { capacity: 0.9, machineClass: '25tクラス', typicalWeight: 1.3 },
};

// --- ヘルパー関数（プロンプト生成用） ---

/** TRUCK_SPECS からプロンプト用の要約テキストを生成 */
export function getTruckSpecsSummary(): string {
  return Object.entries(TRUCK_SPECS)
    .map(([name, t]) => `${name}ダンプ: すり切り約${t.levelVolume}m³、山盛り約${t.heapVolume}m³`)
    .join('、');
}

/** 特定トラック規格のプロンプト用テキストを生成 */
export function getTruckCapacityText(key: string): string {
  const t = TRUCK_SPECS[key];
  if (!t) return '';
  return `${key}ダンプ: すり切り約${t.levelVolume}m³、山盛り約${t.heapVolume}m³`;
}

/** MATERIAL_DENSITIES からエイリアス（'ガラ' を含む名称）を除いた主要素材を返す */
export function getPrimaryMaterials(): [string, number][] {
  return Object.entries(MATERIAL_DENSITIES)
    .filter(([name]) => !name.includes('ガラ'));
}

/** MATERIAL_VOID_RATIOS からエイリアスを除いた主要素材を返す */
export function getPrimaryMaterialVoidRatios(): [string, { typical: number; range: [number, number]; desc: string }][] {
  return Object.entries(MATERIAL_VOID_RATIOS)
    .filter(([name]) => !name.includes('ガラ'));
}

// 積載等級の定義（実測値 / 最大積載量）
export interface LoadGrade {
  name: string;      // 等級名
  minRatio: number;  // 下限（%）
  maxRatio: number;  // 上限（%）
}

export const LOAD_GRADES: LoadGrade[] = [
  { name: '軽すぎ', minRatio: 0, maxRatio: 80 },
  { name: '軽め', minRatio: 80, maxRatio: 90 },
  { name: 'ちょうど', minRatio: 90, maxRatio: 95 },
  { name: 'ギリOK', minRatio: 95, maxRatio: 100 },
  { name: '積みすぎ', minRatio: 100, maxRatio: Infinity },
];
