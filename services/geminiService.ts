import { GoogleGenAI, Type } from "@google/genai";
import { saveCostEntry } from './costTracker';
import { EstimationResult, AnalysisHistory, StockItem, ExtractedFeature, ChatMessage, LearningFeedback, AnalysisProgress } from "../types";
import { SYSTEM_PROMPT, TRUCK_SPECS_PROMPT, WEIGHT_FORMULA_PROMPT } from "../constants";
import { getRecentLearningFeedback } from './indexedDBService';
import { getSelectedTemplate, getSelectedTemplateId } from '../promptTemplates';

// ローカル開発環境かどうかを判定
export const isLocalDev = (): boolean => {
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1';
};

// Gemini CLI経由で推論（ローカル開発用、無料）
const runCliInference = async (
  base64Images: string[],
  prompt: string
): Promise<EstimationResult> => {
  const response = await fetch('/api/gemini-cli', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, base64Images })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || 'CLI inference failed');
  }

  const result = await response.json();
  return { ...result, ensembleCount: 1 };
};

// マルチステップ推論用プロンプト
const MULTISTEP_PROMPTS = {
  step1_height: `【高さ推定タスク】
画像のダンプトラック荷台を観察してください。
後板（あおり）高0.34mを基準として、積載物の山頂までの高さを推定してください。
回答: {"height": 数値(m), "reasoning": "根拠"}`,

  step2_void: `【空隙率推定タスク】
同じ画像の積載物を観察してください。
- 塊の大きさ（細かい/普通/大きい）
- 塊間の隙間の量
- 半楕円体モデルと実際の山盛り形状の差
これらを総合して空隙率を推定してください。
回答: {"voidRatio": 数値(0.30〜0.55), "reasoning": "根拠"}`
};

// ステップ結果の型
export interface MultiStepValue {
  stepNumber: number;
  name: string;
  value: number;
  unit: string;
  reasoning: string;
}

// JSONを安全に抽出するヘルパー
const extractJsonFromText = (text: string): any | null => {
  // まず直接JSONパースを試す
  try { return JSON.parse(text); } catch {}
  // コードブロック内のJSONを試す
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try { return JSON.parse(codeBlockMatch[1].trim()); } catch {}
  }
  // {}で囲まれた部分を試す
  const braceMatch = text.match(/\{[\s\S]*?\}/);
  if (braceMatch) {
    try { return JSON.parse(braceMatch[0]); } catch {}
  }
  return null;
};

// 単一ステップを実行（CLI経由）
export const runSingleStepInference = async (
  base64Images: string[],
  stepPrompt: string
): Promise<{ value: number; reasoning: string }> => {
  const response = await fetch('/api/gemini-cli', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: stepPrompt, base64Images })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || 'Step inference failed');
  }

  const rawText = await response.text();
  console.log('[Step] Raw response:', rawText);

  // JSONを抽出
  const json = extractJsonFromText(rawText);
  if (!json) {
    throw new Error('Failed to parse step result');
  }

  return {
    value: json.height || json.voidRatio || 0,
    reasoning: json.reasoning || ''
  };
};

// 高さ推定ステップを実行
export const runHeightEstimation = async (
  base64Images: string[],
  feedback?: string  // ユーザーからの指摘（再推論時）
): Promise<MultiStepValue> => {
  let prompt = MULTISTEP_PROMPTS.step1_height;
  if (feedback) {
    prompt += `\n\n【ユーザーからの指摘】\n${feedback}\nこの指摘を考慮して再度推定してください。`;
  }
  const result = await runSingleStepInference(base64Images, prompt);
  return {
    stepNumber: 1,
    name: '高さ',
    value: result.value,
    unit: 'm',
    reasoning: result.reasoning
  };
};

// 空隙率推定ステップを実行
export const runVoidRatioEstimation = async (
  base64Images: string[],
  feedback?: string  // ユーザーからの指摘（再推論時）
): Promise<MultiStepValue> => {
  let prompt = MULTISTEP_PROMPTS.step2_void;
  if (feedback) {
    prompt += `\n\n【ユーザーからの指摘】\n${feedback}\nこの指摘を考慮して再度推定してください。`;
  }
  const result = await runSingleStepInference(base64Images, prompt);
  return {
    stepNumber: 2,
    name: '空隙率',
    value: result.value,
    unit: '',
    reasoning: result.reasoning
  };
};

// 承認済みの値から最終結果を計算
export const calculateFinalResult = (
  height: number,
  voidRatio: number,
  maxCapacity?: number
): EstimationResult => {
  const volume = (2/3) * Math.PI * (3.4/2) * (2.0/2) * height;
  const tonnage = volume * 2.5 * (1 - voidRatio);

  return {
    isTargetDetected: true,
    truckType: '4tダンプ',
    licensePlate: null,
    materialType: 'As殻',
    estimatedVolumeM3: Number(volume.toFixed(2)),
    estimatedTonnage: Number(tonnage.toFixed(2)),
    estimatedMaxCapacity: maxCapacity || 3.75,
    maxCapacityReasoning: '',
    confidenceScore: 0.85,
    reasoning: `【ステップ承認済み】height=${height}m, voidRatio=${voidRatio}\n体積=(2/3)×π×1.7×1.0×${height}=${volume.toFixed(2)}m³\n重量=${volume.toFixed(2)}×2.5×(1-${voidRatio})=${tonnage.toFixed(2)}t`,
    materialBreakdown: [{ material: 'As殻', percentage: 100, density: 2.5 }],
    height,
    voidRatio,
    ensembleCount: 1,
  } as EstimationResult;
};

// Gemini CLI経由でマルチステップ推論
const runCliMultiStepInference = async (
  base64Images: string[],
  maxCapacity?: number
): Promise<EstimationResult> => {
  const response = await fetch('/api/gemini-cli-multiturn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompts: [
        MULTISTEP_PROMPTS.step1_height,
        MULTISTEP_PROMPTS.step2_void,
      ],
      base64Images
    })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || 'CLI multistep failed');
  }

  const { steps, result: rawResult } = await response.json();
  console.log('[MultiStep] steps:', steps);
  console.log('[MultiStep] rawResult:', rawResult);

  // Step1から高さを抽出
  let height = 0.5;
  let heightReasoning = '';
  if (steps?.[0]) {
    const json = extractJsonFromText(steps[0]);
    if (json?.height) {
      height = json.height;
      heightReasoning = json.reasoning || '';
    }
  }

  // Step2から空隙率を抽出
  let voidRatio = 0.45;
  let voidReasoning = '';
  if (steps?.[1]) {
    const json = extractJsonFromText(steps[1]);
    if (json?.voidRatio) {
      voidRatio = json.voidRatio;
      voidReasoning = json.reasoning || '';
    }
  }

  // 値が抽出できなかった場合、rawResultから再試行
  if (height === 0.5 || voidRatio === 0.45) {
    const fullJson = extractJsonFromText(rawResult || '');
    if (fullJson) {
      if (fullJson.height && height === 0.5) height = fullJson.height;
      if (fullJson.voidRatio && voidRatio === 0.45) voidRatio = fullJson.voidRatio;
    }
  }

  console.log(`[MultiStep] Extracted: height=${height}m, voidRatio=${voidRatio}`);

  // クライアントサイドで計算（半楕円体）
  const volume = (2/3) * Math.PI * (3.4/2) * (2.0/2) * height;
  const tonnage = volume * 2.5 * (1 - voidRatio);

  return {
    isTargetDetected: true,
    truckType: '4tダンプ',
    licensePlate: null,
    materialType: 'As殻',
    estimatedVolumeM3: Number(volume.toFixed(2)),
    estimatedTonnage: Number(tonnage.toFixed(2)),
    estimatedMaxCapacity: maxCapacity || 3.75,
    maxCapacityReasoning: '',
    confidenceScore: 0.8,
    reasoning: `【マルチステップ推論】\n高さ: ${height}m (${heightReasoning})\n空隙率: ${voidRatio} (${voidReasoning})\n体積=(2/3)×π×1.7×1.0×${height}=${volume.toFixed(2)}m³\n重量=${volume.toFixed(2)}×2.5×(1-${voidRatio})=${tonnage.toFixed(2)}t`,
    materialBreakdown: [{ material: 'As殻', percentage: 100, density: 2.5 }],
    height,
    voidRatio,
    ensembleCount: 1,
  } as EstimationResult;
};

// APIキーがGoogleAIStudioの無料枠かどうかをチェック
const checkIsFreeTier = (): boolean => {
  return localStorage.getItem('gemini_api_key_source') === 'google_ai_studio';
};

// CLI用プロンプト構築（選択されたテンプレートを使用）
const buildCliPrompt = (maxCapacity?: number): string => {
  const template = getSelectedTemplate();
  const capacityLine = maxCapacity
    ? `【重要】この車両の最大積載量は${maxCapacity}トンです。`
    : '最大積載量は画像から推定してください。';

  return `${capacityLine}

画像のダンプトラック積載物の重量を推定してください。

${template.volumePrompt}

【追加出力項目】
estimatedMaxCapacity: 最大積載量の推定値
materialBreakdown: [{"material": string, "percentage": number, "density": number}]`;
};

// クォータ制限エラーかどうかを判定（共通関数）
export const isQuotaError = (err: any): boolean => {
  const message = err?.message || '';
  return message.includes('429') ||
         message.includes('quota') ||
         message.includes('RESOURCE_EXHAUSTED');
};

// クォータエラー用のユーザー向けメッセージ
export const QUOTA_ERROR_MESSAGE = 'APIの利用制限に達しました。しばらくお待ちください。';

// 学習フィードバックの取得件数上限
const RECENT_LEARNING_FEEDBACK_LIMIT = 10;

const getMode = (arr: any[]) => {
  const filtered = arr.filter(v => v !== null && v !== undefined && v !== '');
  if (filtered.length === 0) return arr[0];
  const counts = filtered.reduce((acc, val) => {
    acc[val] = (acc[val] || 0) + 1;
    return acc;
  }, {});
  return Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
};

async function runSingleInference(
  ai: any,
  imageParts: any[],
  modelName: string,
  maxCapacity?: number,
  runIndex: number = 0,
  userFeedback?: ChatMessage[],
  learningFeedback?: LearningFeedback[]  // 学習用フィードバック（過去の指摘）
): Promise<EstimationResult> {

  const maxCapacityInstruction = maxCapacity
    ? `【重要】この車両の最大積載量は${maxCapacity}トンです。estimatedMaxCapacityには${maxCapacity}を設定してください。`
    : `【最大積載量の推定 - 実寸法に基づく判定基準】
ユーザーから最大積載量が提供されていません。以下の実寸法データに基づいて推定してください。

【2tダンプの特徴】（日野デュトロ、いすゞエルフ、三菱キャンター）
- 全長: 約4.7m、全幅: 1.69m（狭い）、全高: 約2.0m
- 荷台長: 約3.0m、荷台幅: 約1.6m、あおり高: 32cm
- キャビン長: 約1.6m（荷台とほぼ同じ長さ）
- 特徴: 普通車並みの車幅、低い車高、小径タイヤ

【4tダンプの特徴】（三菱ファイター、日野レンジャー）
- 全長: 約5.4-5.8m、全幅: 2.19m（道路幅いっぱい）、全高: 約2.4-2.5m
- 荷台長: 約3.4m、荷台幅: 約2.0m、あおり高: 33-35cm
- キャビン長: 約2.0m（荷台より短い）
- 特徴: 幅広ボディ、2t比で明らかに大きいキャビン、大径タイヤ
- 【重要】4tクラスでも荷台補強等により車検上の最大積載量が3.5t〜3.8tになっている車両が非常に多い。「4tダンプ」と呼ばれていても実際の最大積載量は3.5t前後と考えるのが現実的

【8tダンプの特徴】（増トン車）
- 全長: 約6.5-7.0m、全幅: 2.49m、全高: 約2.8-3.0m
- 荷台長: 約4.0-4.5m、荷台幅: 約2.2m
- 特徴: 4tと10tの中間サイズ、後輪がダブルタイヤ

【10t/11tダンプの特徴】（日野プロフィア、いすゞギガ、三菱スーパーグレート）
- 全長: 約7.6-8.0m、全幅: 2.49m（法定上限）、全高: 約3.3-3.7m
- 荷台長: 約5.1-5.3m、荷台幅: 約2.2-2.35m、あおり高: 50cm
- キャビン長: 約2.5m（荷台の半分程度）
- 特徴: 非常に高い車高、巨大なキャビン、後輪ダブルタイヤ

【判別のポイント - ナンバープレート幅を実測して基準にする】
大型車ナンバープレート実寸: 幅440mm（44cm）

■ 手順
1. 画像内のナンバープレートの幅をピクセル単位で測定する
2. そのピクセル数を44cmとして換算係数を求める
3. 後板（あおり）の高さをピクセルで測定し、実寸に換算する

■ 後板高さによる車両判定
- 後板32cm以下 → 2tダンプ（ナンバー幅の約0.7倍）
- 後板33-40cm → 4tダンプ（ナンバー幅の約0.8倍）
- 後板45cm以上 → 8t/10tダンプ（ナンバー幅の約1.0倍以上）

→ 後板がナンバー幅と同等以上なら8t以上、明らかに低ければ2t/4t

■ その他の視覚的特徴
- キャビンと荷台の比率: 2tは同程度、大型は荷台が長い

【禁止事項】
- ナンバープレートの分類番号から積載量を推測しないこと（分類番号は積載量と無関係）
- 確認できない情報を推測・創作しないこと
- 独自の理論や解釈を展開しないこと
- 上記に記載されていない判定基準を使用しないこと`;

  // 選択されたプロンプトテンプレートを取得
  const template = getSelectedTemplate();

  const promptText = `画像の内容を判定し、重量を推定してください。

${maxCapacityInstruction}

【車両規格別 荷台容積（基準値）】
${TRUCK_SPECS_PROMPT}
※ すり切り=あおり高さまで、山盛り=すり切り×1.3

${template.volumePrompt}

【回答ルール（厳守）】
- 事実のみを記述し、推測・創作・持論は一切禁止
- reasoningには以下の形式で記載:
  「車両: ○tダンプ。体積: (○m²+○m²)/2×○m=○m³。素材: ○○、塊サイズ○○。密度○t/m³、空隙率○を適用。計算: ○×○×(1-○)=○t」
- 計算式: 体積 × 密度 × (1-空隙率) = 推定重量
- maxCapacityReasoningには視覚的根拠のみを記載（確認できない情報は「確認不可」）
- 与えられたパラメータ（密度・空隙率）をそのまま使用すること。独自の数値を使わないこと
- この画像の視覚的特徴のみから独立して判断すること
${userFeedback && userFeedback.length > 0 ? `
【ユーザーからの指摘・修正】
以下は前回の解析結果に対するユーザーからのフィードバックです。これらの指摘を考慮して再解析してください。
※ 数値は参考程度に。自身の推論で判断すること。
${userFeedback.map(msg => {
  // ユーザーメッセージから実測値と思われる数値をマスク
  const content = msg.role === 'user'
    ? msg.content.replace(/(\d+\.?\d*)\s*(t|トン|kg|キロ)/gi, '[数値]$2')
    : msg.content;
  return `${msg.role === 'user' ? 'ユーザー' : 'AI'}: ${content}`;
}).join('\n')}
` : ''}
${learningFeedback && learningFeedback.length > 0 ? `
【過去の学習データ（重要）】
以下は過去の解析で得られた重要な指摘・知見です。同様の状況では必ずこれらを考慮してください。
${learningFeedback.map((fb, idx) => {
  const typeLabel = fb.feedbackType === 'correction' ? '訂正' : fb.feedbackType === 'insight' ? '知見' : 'ルール';
  // 具体的な数値は教えず、傾向のみを伝える
  const directionHint = fb.actualTonnage && fb.aiEstimation
    ? (fb.actualTonnage > fb.aiEstimation ? '（AI推定は過小傾向だった）' : fb.actualTonnage < fb.aiEstimation ? '（AI推定は過大傾向だった）' : '')
    : '';
  return `${idx + 1}. [${typeLabel}] ${fb.summary}${directionHint}`;
}).join('\n')}
` : ''}
すべての回答は日本語で行ってください。`;

  const response = await ai.models.generateContent({
    model: modelName,
    contents: {
      parts: [
        ...imageParts,  // 解析対象の画像
        { text: promptText }
      ],
    },
    config: {
      systemInstruction: template.systemPrompt,
      responseMimeType: "application/json",
      temperature: 0.4,  // 推論のバリエーションを増やす
      topP: 0.95,
      // Google Search Grounding: 車両・重機のスペックを外部検索で取得
      tools: [{ googleSearch: {} }],
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          isTargetDetected: { type: Type.BOOLEAN },
          truckType: { type: Type.STRING },
          licensePlate: { type: Type.STRING, nullable: true },
          licenseNumber: { type: Type.STRING, nullable: true },
          materialType: { type: Type.STRING },
          estimatedVolumeM3: { type: Type.NUMBER },
          estimatedTonnage: { type: Type.NUMBER },
          estimatedMaxCapacity: { type: Type.NUMBER },
          maxCapacityReasoning: { type: Type.STRING },
          confidenceScore: { type: Type.NUMBER },
          reasoning: { type: Type.STRING },
          loadCondition: { type: Type.STRING, nullable: true },  // 積載状態
          chunkSize: { type: Type.STRING, nullable: true },      // 塊サイズ
          lowerArea: { type: Type.NUMBER },                      // 底面積（必須）
          upperArea: { type: Type.NUMBER },                      // 上面積（必須）
          height: { type: Type.NUMBER },                         // 高さ（必須）
          voidRatio: { type: Type.NUMBER },                      // 空隙率（必須）
          materialBreakdown: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                material: { type: Type.STRING },
                percentage: { type: Type.NUMBER },
                density: { type: Type.NUMBER },
              },
              required: ["material", "percentage", "density"]
            }
          }
        },
        required: ["isTargetDetected", "truckType", "materialType", "estimatedVolumeM3", "estimatedTonnage", "estimatedMaxCapacity", "maxCapacityReasoning", "confidenceScore", "reasoning", "materialBreakdown", "lowerArea", "upperArea", "height", "voidRatio"]
      }
    },
  });

  const text = response.text;
  if (!text) throw new Error("APIレスポンスが空です");
  return { ...JSON.parse(text), ensembleCount: 1 };
}

export function mergeResults(results: EstimationResult[]): EstimationResult {
  const count = results.length;
  if (count === 0) throw new Error("結果がありません");

  if (results.every(r => !r.isTargetDetected)) {
    return results[0];
  }

  const validResults = results.filter(r => r.isTargetDetected);
  const resultCount = validResults.length;

  const avgTonnage = validResults.reduce((sum, r) => sum + r.estimatedTonnage, 0) / resultCount;
  const avgVolume = validResults.reduce((sum, r) => sum + r.estimatedVolumeM3, 0) / resultCount;

  const finalTruckType = getMode(validResults.map(r => r.truckType));
  const finalLicenseNumber = getMode(validResults.map(r => r.licenseNumber));
  const finalLicensePlate = getMode(validResults.map(r => r.licensePlate));

  // 最大積載量は最頻値を採用
  const finalMaxCapacity = getMode(validResults.map(r => r.estimatedMaxCapacity));

  const closestToAvg = validResults.reduce((prev, curr) =>
    Math.abs(curr.estimatedTonnage - avgTonnage) < Math.abs(prev.estimatedTonnage - avgTonnage) ? curr : prev
  );

  return {
    ...closestToAvg,
    isTargetDetected: true,
    truckType: finalTruckType,
    licensePlate: finalLicensePlate,
    licenseNumber: finalLicenseNumber,
    estimatedTonnage: Number(avgTonnage.toFixed(2)),
    estimatedVolumeM3: Number(avgVolume.toFixed(2)),
    estimatedMaxCapacity: finalMaxCapacity ? Number(finalMaxCapacity) : closestToAvg.estimatedMaxCapacity,
    ensembleCount: count,
    reasoning: `【統合推論】有効サンプル:${resultCount}/${count}。${closestToAvg.reasoning}`
  };
}

export const getApiKey = (): string | null => {
  return localStorage.getItem('gemini_api_key');
};

export const setApiKey = (key: string, isGoogleAIStudio: boolean = false): void => {
  localStorage.setItem('gemini_api_key', key);
  localStorage.setItem('gemini_api_key_source', isGoogleAIStudio ? 'google_ai_studio' : 'other');
};

export const clearApiKey = (): void => {
  localStorage.removeItem('gemini_api_key');
  localStorage.removeItem('gemini_api_key_source');
};

export const isGoogleAIStudioKey = (): boolean => {
  return localStorage.getItem('gemini_api_key_source') === 'google_ai_studio';
};

// 既存のAPIキーから自動判定を試みる（軽量なAPI呼び出しで判定）
export const detectApiKeySource = async (): Promise<'google_ai_studio' | 'other' | 'unknown'> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    return 'unknown';
  }

  // 既にソースが設定されている場合はそれを返す
  const existingSource = localStorage.getItem('gemini_api_key_source');
  if (existingSource === 'google_ai_studio' || existingSource === 'other') {
    return existingSource as 'google_ai_studio' | 'other';
  }

  // APIキーの形式チェック（AIzaで始まるか）
  if (!apiKey.startsWith('AIza')) {
    return 'unknown';
  }

  // 実際のAPI呼び出しで判定を試みる
  // Google AI Studioの無料枠は通常、特定のエンドポイントやレート制限で判定可能
  // ただし、確実な判定は難しいため、デフォルトでは'unknown'を返す
  // ユーザーに確認を求める方が確実
  
  try {
    const ai = new GoogleGenAI({ apiKey });
    // 最小限のAPI呼び出しでキーが有効かチェック
    // 実際の判定は難しいため、ここでは'unknown'を返す
    // ユーザーに確認を求める方が確実
    return 'unknown';
  } catch {
    return 'unknown';
  }
};

export const analyzeGaraImageEnsemble = async (
  base64Images: string[],
  targetCount: number,
  _learningData: AnalysisHistory[] = [],  // 未使用（後方互換性のため残す）
  onProgress: (current: number, result: EstimationResult) => void,
  abortSignal?: { cancelled: boolean },
  modelName: string = 'gemini-3-flash-preview',
  _taggedStock: StockItem[] = [],  // 未使用（後方互換性のため残す）
  maxCapacity?: number,
  userFeedback?: ChatMessage[],  // ユーザーからの指摘・修正
  onDetailedProgress?: (progress: AnalysisProgress) => void  // 詳細な進捗通知
): Promise<EstimationResult[]> => {
  const notifyProgress = (progress: AnalysisProgress) => {
    onDetailedProgress?.(progress);
  };

  notifyProgress({ phase: 'preparing', detail: '解析を準備中...' });
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('APIキーが設定されていません');
  }
  const ai = new GoogleGenAI({ apiKey });

  // 過去の学習フィードバックを取得
  notifyProgress({ phase: 'loading_references', detail: '学習データを読み込み中...' });
  let learningFeedback: LearningFeedback[] = [];
  try {
    learningFeedback = await getRecentLearningFeedback(RECENT_LEARNING_FEEDBACK_LIMIT);
  } catch (err) {
    console.warn('学習フィードバックの取得に失敗:', err);
  }

  const imageParts = base64Images.map(base64 => ({
    inlineData: { mimeType: 'image/jpeg', data: base64 }
  }));

  const results: EstimationResult[] = [];
  let lastError: Error | null = null;

  for (let i = 0; i < targetCount; i++) {
    if (abortSignal?.cancelled) break;

    notifyProgress({
      phase: 'inference',
      detail: targetCount > 1
        ? `Gemini APIにリクエスト送信中... (${i + 1}/${targetCount}回目)`
        : `Gemini APIにリクエスト送信中...`,
      current: i + 1,
      total: targetCount
    });

    try {
      const res = await runSingleInference(ai, imageParts, modelName, maxCapacity, i, userFeedback, learningFeedback);

      notifyProgress({
        phase: 'inference',
        detail: targetCount > 1
          ? `推論結果を受信 (${i + 1}/${targetCount}回目): ${res.estimatedTonnage.toFixed(1)}t`
          : `推論結果を受信: ${res.estimatedTonnage.toFixed(1)}t`,
        current: i + 1,
        total: targetCount
      });

      if (i === 0 && !res.isTargetDetected) {
        return [res];
      }

      results.push(res);
      await saveCostEntry(modelName, imageParts.length, checkIsFreeTier());
      onProgress(results.length, res);
    } catch (err: any) {
      console.error(`推論エラー #${i + 1}:`, err);
      lastError = err;
    }
  }

  // 全ての推論が失敗した場合、最後のエラーをスロー
  if (results.length === 0 && lastError) {
    throw lastError;
  }

  // 複数推論の場合は統合フェーズを通知
  if (results.length > 1) {
    notifyProgress({ phase: 'merging', detail: `${results.length}件の推論結果を統合中...` });
  }

  notifyProgress({ phase: 'done', detail: '解析完了' });

  return results;
};

// 特徴抽出：正解付き画像から積載物パラメータを抽出
export const extractFeatures = async (
  base64Image: string,
  actualTonnage: number,
  tag: 'OK' | 'NG',
  maxCapacity?: number,
  vehicleName?: string  // 登録車両名（マッチ済みの場合）
): Promise<{ features: ExtractedFeature[]; rawResponse: string }> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('APIキーが設定されていません');
  }

  const ai = new GoogleGenAI({ apiKey });

  // 車両情報が既知かどうかでプロンプトを分岐
  const vehicleKnown = !!(maxCapacity && vehicleName);

  const prompt = vehicleKnown ? `
あなたは積載量推定の専門家です。

【既知データ】
- 車両: ${vehicleName}
- 最大積載量: ${maxCapacity}t
- 実測重量: ${actualTonnage}t（${tag === 'OK' ? '適正積載' : '過積載'}）

【重量計算式】
${WEIGHT_FORMULA_PROMPT}

【タスク】
車両データは既知なので、積載物のパラメータのみ抽出してください。

【出力形式】JSON配列
[
  {
    "parameterName": "パラメータ名",
    "value": 数値または文字列,
    "unit": "単位（あれば）",
    "description": "このパラメータの意味",
    "reference": "測定基準"
  }
]

【抽出パラメータ】
- material_type: 積載物の種類（土砂/As殻/Co殻/開粒度As殻/混合）
- load_height_ratio: 後板高さに対する積載高さの比率
- apparent_volume_m3: 見かけ体積の推定値（m³）
- void_ratio: 空隙率の推定値（0.10〜0.30）
- surface_profile: 表面形状（flat/mounded/peaked）

【検証】
見かけ体積 × 密度 × (1-空隙率) ≒ ${actualTonnage}t になるか確認
` : `
あなたは積載量推定の専門家です。
この画像は実測 ${actualTonnage}t で、${tag === 'OK' ? '適正積載' : '過積載'}と判定されました。
${maxCapacity ? `最大積載量は ${maxCapacity}t です。` : ''}

【重量計算式】
${WEIGHT_FORMULA_PROMPT}

【寸法測定の基準】
大型車ナンバープレート幅: 440mm（44cm）
→ 画像内のプレート幅ピクセル数を基準に実寸を換算

【タスク】
この画像から、実測${actualTonnage}tを再現するために必要なパラメータを抽出してください。

【出力形式】JSON配列
[
  {
    "parameterName": "パラメータ名",
    "value": 数値または文字列,
    "unit": "単位（あれば）",
    "description": "このパラメータの意味",
    "reference": "測定基準（例: ナンバープレート幅基準）"
  }
]

【必須パラメータ】
- material_type: 積載物の種類（土砂/As殻/Co殻/開粒度As殻/混合）
- plate_width_px: ナンバープレート幅のピクセル数
- tailgate_height_px: 後板（あおり）高さのピクセル数
- tailgate_height_m: 後板の実寸（プレート幅基準で換算、単位:m）
- load_height_ratio: 後板高さに対する積載高さの比率
- apparent_volume_m3: 見かけ体積の推定値（m³）
- void_ratio: 空隙率の推定値（0.10〜0.30）
- surface_profile: 表面形状（flat/mounded/peaked）

【検証】
見かけ体積 × 密度 × (1-空隙率) ≒ ${actualTonnage}t になるか確認
`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: {
      parts: [
        { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
        { text: prompt }
      ],
    },
    config: {
      responseMimeType: "application/json",
      temperature: 0.2,
    }
  });

  const rawResponse = response.text || '[]';
  await saveCostEntry('gemini-2.0-flash', 1, checkIsFreeTier());

  try {
    const features = JSON.parse(rawResponse) as ExtractedFeature[];
    return { features, rawResponse };
  } catch {
    return { features: [], rawResponse };
  }
};

// 解析後にAIに追加質問する機能
export const askFollowUp = async (
  base64Images: string[],
  analysisResult: EstimationResult,
  chatHistory: ChatMessage[],
  userQuestion: string,
  modelName: string = 'gemini-2.0-flash'
): Promise<string> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('APIキーが設定されていません');
  }

  const ai = new GoogleGenAI({ apiKey });

  // 元の解析結果を文脈として構築
  const analysisContext = `
【先ほどの解析結果】
- 推定重量: ${analysisResult.estimatedTonnage}t
- 車両タイプ: ${analysisResult.truckType}
- 積載物: ${analysisResult.materialType}
- 推定体積: ${analysisResult.estimatedVolumeM3}m³
- 確信度: ${(analysisResult.confidenceScore * 100).toFixed(0)}%
- 判断理由: ${analysisResult.reasoning}
- 材質内訳: ${analysisResult.materialBreakdown.map(m => `${m.material}(${m.percentage}%)`).join(', ')}
`;

  // 会話履歴をパーツに変換
  const historyParts = chatHistory.flatMap(msg => [
    { text: msg.role === 'user' ? `【ユーザーの質問】${msg.content}` : `【AIの回答】${msg.content}` }
  ]);

  // 画像パーツ
  const imageParts = base64Images.map(base64 => ({
    inlineData: { mimeType: 'image/jpeg', data: base64 }
  }));

  const response = await ai.models.generateContent({
    model: modelName,
    contents: {
      parts: [
        ...imageParts,
        { text: analysisContext },
        ...historyParts,
        { text: `【ユーザーの新しい質問】${userQuestion}\n\n上記の画像と解析結果を踏まえて、質問に日本語で丁寧に回答してください。なぜその推定に至ったかの根拠を詳しく説明してください。` }
      ],
    },
    config: {
      systemInstruction: `あなたはダンプトラックの積載量推定を行ったAIアシスタントです。
先ほどこの画像を解析して重量推定を行いました。
ユーザーからの質問に対して、なぜその判断をしたのか、どの視覚的特徴に基づいているのかを詳しく説明してください。
専門的な知識も交えながら、わかりやすく回答してください。`,
      temperature: 0.7,
    }
  });

  const text = response.text || '回答を生成できませんでした。';
  await saveCostEntry(modelName, base64Images.length, checkIsFreeTier());

  return text;
};
