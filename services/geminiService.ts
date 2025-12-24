import { GoogleGenAI, Type } from "@google/genai";
import { saveCostEntry } from './costTracker';
import { EstimationResult, AnalysisHistory, StockItem, ExtractedFeature, ChatMessage } from "../types";
import { SYSTEM_PROMPT } from "../constants";
import { getReferenceImages } from './referenceImages';

// APIキーがGoogleAIStudioの無料枠かどうかをチェック
const checkIsFreeTier = (): boolean => {
  return localStorage.getItem('gemini_api_key_source') === 'google_ai_studio';
};

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
  userFeedback?: ChatMessage[]
): Promise<EstimationResult> {
  // 参考画像を取得
  const referenceImages = getReferenceImages();
  const refImageParts: any[] = [];
  let refImagePrompt = '';

  if (referenceImages.length > 0) {
    refImagePrompt = '\n【登録車両】以下は登録済み車両の画像です。解析対象の車両と比較して、最も近い車両を特定し、その最大積載量を参考にしてください。\n';
    referenceImages.forEach((ref, idx) => {
      const mimeType = ref.mimeType || 'image/jpeg';
      refImageParts.push({ inlineData: { mimeType, data: ref.base64 } });
      refImagePrompt += `- 登録車両${idx + 1}: ${ref.name}（最大積載量: ${ref.maxCapacity}t）\n`;
    });
  }

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

【重要な注意】
- ナンバープレートの分類番号（100, 130等）は車両サイズや積載量を示さない（希望ナンバーかどうかの区別のみ）
- 知らないことを推測で解釈しないこと
- 確実にわかる視覚的特徴のみを根拠にすること`;

  const promptText = `画像の内容を判定し、重量を推定してください。

${maxCapacityInstruction}

【重量計算の基準】
重量 = 見かけ体積(m³) × 密度(t/m³) × (1 - 空隙率)

■ 素材別密度（参考値）
- 土砂: 1.8 t/m³
- As殻（アスファルトガラ）: 2.5 t/m³
- Co殻（コンクリートガラ）: 2.5 t/m³
- 開粒度As殻: 2.35 t/m³

■ 空隙率（10〜30%の範囲で見た目から判断）
- 細かく砕けている、締まっている → 10〜15%
- 標準的な状態 → 15〜20%
- 塊が大きい、ゴロゴロしている → 20〜30%

【推論ルール】
- 過去の推定結果があっても無視し、この画像の視覚的特徴のみから独立して判断すること
- 荷台の埋まり具合、積載物の山の高さ、材質の見た目を根拠として明記すること
- reasoningには「体積」「適用した密度」「空隙率とその判断理由」を明記すること
- maxCapacityReasoningには「なぜその最大積載量と判断したか」をキャビン比率・車高などの視覚的根拠で記述すること
- 推論ラン#${runIndex + 1}: 毎回独自の視点で分析すること
${refImagePrompt}
${userFeedback && userFeedback.length > 0 ? `
【ユーザーからの指摘・修正】
以下は前回の解析結果に対するユーザーからのフィードバックです。これらの指摘を考慮して再解析してください。
${userFeedback.map(msg => `${msg.role === 'user' ? 'ユーザー' : 'AI'}: ${msg.content}`).join('\n')}
` : ''}
すべての回答は日本語で行ってください。`;

  const response = await ai.models.generateContent({
    model: modelName,
    contents: {
      parts: [
        ...refImageParts,  // 参考画像（あれば）
        { text: refImageParts.length > 0 ? '【解析対象の画像】' : '' },
        ...imageParts,  // 解析対象の画像
        { text: promptText }
      ],
    },
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      temperature: 0.4,  // 推論のバリエーションを増やす
      topP: 0.95,
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
        required: ["isTargetDetected", "truckType", "materialType", "estimatedVolumeM3", "estimatedTonnage", "estimatedMaxCapacity", "maxCapacityReasoning", "confidenceScore", "reasoning", "materialBreakdown"]
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
  _learningData: AnalysisHistory[] = [],  // 未使用（純粋アンサンブルのため）
  onProgress: (current: number, result: EstimationResult) => void,
  abortSignal?: { cancelled: boolean },
  modelName: string = 'gemini-3-flash-preview',
  _taggedStock: StockItem[] = [],  // 未使用（純粋アンサンブルのため）
  maxCapacity?: number,
  userFeedback?: ChatMessage[]  // ユーザーからの指摘・修正
): Promise<EstimationResult[]> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('APIキーが設定されていません');
  }
  const ai = new GoogleGenAI({ apiKey });

  // 純粋アンサンブル: 各ランは画像のみから独立して推論
  // 過去データとの比較は結果表示時に行う（推論には影響させない）

  const imageParts = base64Images.map(base64 => ({
    inlineData: { mimeType: 'image/jpeg', data: base64 }
  }));

  const results: EstimationResult[] = [];

  for (let i = 0; i < targetCount; i++) {
    if (abortSignal?.cancelled) break;

    try {
      const res = await runSingleInference(ai, imageParts, modelName, maxCapacity, i, userFeedback);

      if (i === 0 && !res.isTargetDetected) {
        return [res];
      }

      results.push(res);
      saveCostEntry(modelName, imageParts.length, checkIsFreeTier());
      onProgress(results.length, res);
    } catch (err) {
      console.error(`推論エラー #${i + 1}:`, err);
    }
  }

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
重量(t) = 見かけ体積(m³) × 密度(t/m³) × (1 - 空隙率)

■ 素材別密度（固定値）
- 土砂: 1.8 t/m³
- As殻（アスファルトガラ）: 2.5 t/m³
- Co殻（コンクリートガラ）: 2.5 t/m³
- 開粒度As殻: 2.35 t/m³

■ 空隙率: 10〜30%（積込状態により変動）

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
重量(t) = 見かけ体積(m³) × 密度(t/m³) × (1 - 空隙率)

■ 素材別密度（固定値）
- 土砂: 1.8 t/m³
- As殻（アスファルトガラ）: 2.5 t/m³
- Co殻（コンクリートガラ）: 2.5 t/m³
- 開粒度As殻: 2.35 t/m³

■ 空隙率: 10〜30%（積込状態により変動）

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
  saveCostEntry('gemini-2.0-flash', 1, checkIsFreeTier());

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
  saveCostEntry(modelName, base64Images.length, checkIsFreeTier());

  return text;
};
