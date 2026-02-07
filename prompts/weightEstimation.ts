import {
  TRUCK_SPECS,
  VOID_RATIOS,
  BUCKET_SPECS,
  LOAD_GRADES,
  getPrimaryMaterials,
  getPrimaryMaterialVoidRatios,
  getTruckSpecsSummary,
} from '../domain/specs.ts';
import { ranges } from '../domain/promptSpec.ts';

// 車両規格をプロンプト用テキストに変換
export const TRUCK_SPECS_PROMPT = Object.entries(TRUCK_SPECS)
  .map(([name, spec]) =>
    `- ${name}ダンプ: 荷台${spec.bedLength}m×${spec.bedWidth}m×${spec.bedHeight}m, すり切り${spec.levelVolume}m³, 山盛り${spec.heapVolume}m³, 最大積載${spec.maxCapacity}t`
  ).join('\n');

// 素材密度をプロンプト用テキストに変換（エイリアスはSSOTで除外済み）
export const MATERIAL_DENSITIES_PROMPT = getPrimaryMaterials()
  .map(([name, density]) => `- ${name}: ${density} t/m³`)
  .join('\n');

// 素材別空隙率をプロンプト用テキストに変換（エイリアスはSSOTで除外済み）
export const MATERIAL_VOID_RATIOS_PROMPT = getPrimaryMaterialVoidRatios()
  .map(([name, v]) => `- ${name}: 標準${Math.round(v.typical * 100)}%（${Math.round(v.range[0] * 100)}〜${Math.round(v.range[1] * 100)}%）← ${v.desc}`)
  .join('\n');

// 空隙率をプロンプト用テキストに変換（後方互換用）
export const VOID_RATIOS_PROMPT = Object.entries(VOID_RATIOS)
  .map(([, v]) => `- ${v.desc} → ${Math.round(v.min * 100)}〜${Math.round(v.max * 100)}%`)
  .join('\n');

// バケット容量をプロンプト用テキストに変換
export const BUCKET_SPECS_PROMPT = Object.entries(BUCKET_SPECS)
  .map(([name, spec]) =>
    `- ${name}（${spec.capacity}m³）: ${spec.machineClass}、土砂一杯で約${spec.typicalWeight}t`
  ).join('\n');

// 等級定義をプロンプト用テキストに変換
export const LOAD_GRADES_PROMPT = `■ 積載等級（実測値 ÷ 最大積載量）
${LOAD_GRADES.map(g =>
  g.maxRatio === Infinity
    ? `- ${g.name}: ${g.minRatio}%超`
    : `- ${g.name}: ${g.minRatio}〜${g.maxRatio}%`
).join('\n')}

※ 過去の実測データは等級別に提供されます。「この見た目で何トンだったか」を参考に推定してください。`;

// 重量計算式プロンプト（コード側計算の説明用）- ranges は prompt-spec.json SSOT から取得
const h = ranges.height;
const s = ranges.slope;
const fr = ranges.fillRatioL; // L/W/Z は同じ range
const pd = ranges.packingDensity;
export const WEIGHT_FORMULA_PROMPT = `重量計算はコード側で行います。AIは以下の幾何学的パラメータを推定してください:
- height: 積載高さ m（${h.step}m刻み、後板=${h.calibration['後板']}m/ヒンジ=${h.calibration['ヒンジ']}mを目印）
- slope: 前後方向の高低差 m (${s.min}〜${s.max})
- fillRatioL: 長さ方向の充填率 (${ranges.fillRatioL.min}〜${ranges.fillRatioL.max})
- fillRatioW: 幅方向の充填率 (${ranges.fillRatioW.min}〜${ranges.fillRatioW.max})
- fillRatioZ: 高さ方向の充填率 (${ranges.fillRatioZ.min}〜${ranges.fillRatioZ.max})
- packingDensity: ガラの詰まり具合 (${pd.min}〜${pd.max})

■ 素材別密度（参考情報）
${MATERIAL_DENSITIES_PROMPT}`;

/** SYSTEM_PROMPT を構築する（CLI版と統一: AIはパラメータ推定のみ、計算はコード側） */
function getSystemPrompt(): string {
  return `あなたは建設廃棄物（ガラ）の積載パラメータ推定システムです。
画像から荷台の幾何学的パラメータを推定してください。重量計算はコード側で行うため、AIは観察と推定のみ行うこと。

【最重要：創作・推測の禁止】
- 画像から確実に確認できる情報のみを使用すること
- 見えないもの、確認できないものについては「不明」「確認不可」と記載すること
- 憶測、仮説、想像に基づく記述は一切禁止

【回答形式】
- すべての回答は日本語で行ってください
- reasoningフィールドは必ず日本語で記述してください

### 誤検出防止 (CRITICAL)
1. **対象確認 (isTargetDetected)**:
   - トラック荷台に廃棄物が積載されている画像のみ true
   - 空車、乗用車、通行人、風景、判別不能 → false（他の項目は0）
2. **確信度 (confidenceScore)**: 0.0〜1.0。迷いがあれば 0.7 以下
3. **ナンバープレート**: 地名、分類番号、ひらがな、一連指定番号を特定

### パラメータ推定（重量計算はコード側で行う）
AIの役割は以下の幾何学的パラメータを画像から推定すること:
- upperArea: 荷台上面の積載割合 (${ranges.upperArea.min}〜${ranges.upperArea.max})
- height: 積載高さ m (${h.step}m刻み、後板=${h.calibration['後板']}m/ヒンジ=${h.calibration['ヒンジ']}mを目印に)
- slope: 前後方向の高低差 m (${s.min}〜${s.max})
- fillRatioL: 長さ方向の充填率 (${ranges.fillRatioL.min}〜${ranges.fillRatioL.max})
- fillRatioW: 幅方向の充填率 (${ranges.fillRatioW.min}〜${ranges.fillRatioW.max})
- fillRatioZ: 高さ方向の充填率 (${ranges.fillRatioZ.min}〜${ranges.fillRatioZ.max})
- packingDensity: ガラの詰まり具合 (${pd.min}〜${pd.max})

※ estimatedVolumeM3やestimatedTonnageは出力不要（コード側で計算する）

### 状況認識
- バックホウ等の重機が写っている場合は「積込作業中」と認識
- reasoningに現場の状況を明記

### 外部検索の活用
- 【登録車両優先】プロンプトに「登録車両」情報がある場合はそれを優先
- 登録車両にマッチしない場合のみ外部検索で機種を特定

【バックホウ バケット容量の目安】
${BUCKET_SPECS_PROMPT}

【reasoningフィールドの書式（厳守）】
「車両: ○tダンプ。素材: ○○。高さ: 後板から○cm上 → ○m。充填: L=○ W=○ Z=○。密度: ○。」
※ 観察した事実のみ記述。計算式は書かないこと（コード側で計算する）。`;
}

// 後方互換: モジュールロード時に評価（従来と同じconst export）
export const SYSTEM_PROMPT = getSystemPrompt();
