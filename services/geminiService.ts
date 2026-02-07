import { GoogleGenAI, Part, Type } from "@google/genai";
import { saveCostEntry } from "./costTracker";
import { EstimationResult, AnalysisHistory, StockItem, ExtractedFeature, ChatMessage, LearningFeedback, AnalysisProgress } from "../types";
import { SYSTEM_PROMPT, WEIGHT_FORMULA_PROMPT } from "../prompts/weightEstimation";
import { getReferenceImages } from "./referenceImages";
import { getRecentLearningFeedback } from "./indexedDBService";
import { GradedStockItem, selectStockByGrade, getTruckClass, TruckClass } from "./stockService";
import { getApiKey, checkIsFreeTier } from "./configService";
import { mergeResults } from "../utils/analysisUtils";
import { calculateTonnage } from "../utils/calculation";
import { buildInferencePrompt, buildReferenceImageSection, buildTaggedStockSection } from "../prompts/inferencePrompt";

// Re-exports for backward compatibility
export { getApiKey, setApiKey, clearApiKey, isGoogleAIStudioKey } from "./configService";
export { mergeResults } from "../utils/analysisUtils";

// クォータ制限エラーかどうかを判定（共通関数）
export const isQuotaError = (err: unknown): boolean => {
  const message = err instanceof Error ? err.message : String(err ?? "");
  return message.includes("429") ||
         message.includes("quota") ||
         message.includes("RESOURCE_EXHAUSTED");
};

// クォータエラー用のユーザー向けメッセージ
export const QUOTA_ERROR_MESSAGE = "APIの利用制限に達しました。しばらくお待ちください。";

// 学習フィードバックの取得件数上限
const RECENT_LEARNING_FEEDBACK_LIMIT = 10;

// runSingleInference用のレスポンススキーマ定義
const ESTIMATION_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    isTargetDetected: { type: Type.BOOLEAN },
    truckType: { type: Type.STRING },
    licensePlate: { type: Type.STRING, nullable: true },
    licenseNumber: { type: Type.STRING, nullable: true },
    materialType: { type: Type.STRING },
    upperArea: { type: Type.NUMBER, description: '荷台床面積に対する上面積の比率 (0.2~0.6)' },
    height: { type: Type.NUMBER, description: '積載高さ m (0.0~0.6, 0.05m刻み)' },
    slope: { type: Type.NUMBER, description: '前後方向の高低差 m (0.0~0.3)' },
    packingDensity: { type: Type.NUMBER, description: 'ガラの詰まり具合 (0.7~0.9)' },
    fillRatioL: { type: Type.NUMBER, description: '長さ方向の充填率 (0.7~1.0)' },
    fillRatioW: { type: Type.NUMBER, description: '幅方向の充填率 (0.7~1.0)' },
    fillRatioZ: { type: Type.NUMBER, description: '高さ方向の充填率 (0.7~1.0)' },
    confidenceScore: { type: Type.NUMBER },
    reasoning: { type: Type.STRING },
    // Web-only extensions
    estimatedMaxCapacity: { type: Type.NUMBER },
    maxCapacityReasoning: { type: Type.STRING },
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
  required: ["isTargetDetected", "truckType", "materialType", "upperArea", "height", "slope", "packingDensity", "fillRatioL", "fillRatioW", "fillRatioZ", "confidenceScore", "reasoning", "estimatedMaxCapacity", "maxCapacityReasoning", "materialBreakdown"]
} as const;

async function runSingleInference(
  ai: GoogleGenAI,
  imageParts: Part[],
  modelName: string,
  maxCapacity?: number,
  runIndex: number = 0,
  userFeedback?: ChatMessage[],
  taggedStock?: StockItem[],  // 実測値付きの過去データ
  learningFeedback?: LearningFeedback[]  // 学習用フィードバック（過去の指摘）
): Promise<EstimationResult> {
  // 参考画像を取得
  const referenceImages = await getReferenceImages();
  const refSection = buildReferenceImageSection(referenceImages);

  // 実測値付き過去データのプロンプト生成
  const taggedSection = buildTaggedStockSection(taggedStock);

  // プロンプトを構築
  const promptText = buildInferencePrompt({
    maxCapacity,
    userFeedback,
    learningFeedback,
    hasTaggedStock: taggedSection.prompt.length > 0,
    refImagePrompt: refSection.prompt,
    taggedStockPrompt: taggedSection.prompt,
  });

  const response = await ai.models.generateContent({
    model: modelName,
    contents: {
      parts: [
        ...refSection.imageParts,  // 参考画像（登録車両）
        ...(taggedSection.imageParts.length > 0 ? [{ text: '【実測データ画像】' }, ...taggedSection.imageParts] : []),  // 実測データ画像
        { text: (refSection.imageParts.length > 0 || taggedSection.imageParts.length > 0) ? '【解析対象の画像】' : '' },
        ...imageParts,  // 解析対象の画像
        { text: promptText }
      ],
    },
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      temperature: 0.4,  // 推論のバリエーションを増やす
      topP: 0.95,
      // Google Search Grounding: 車両・重機のスペックを外部検索で取得
      tools: [{ googleSearch: {} }],
      responseSchema: ESTIMATION_RESPONSE_SCHEMA
    },
  });


  const text = response.text;
  if (!text) throw new Error("APIレスポンスが空です");

  try {
    const parsed = JSON.parse(text);
    // Code-side calculation (CLI版と同じ: AIはパラメータのみ→コード側で体積・トン数計算)
    const { volume, tonnage } = calculateTonnage({
      fillRatioW: parsed.fillRatioW ?? 0.85,
      height: parsed.height ?? 0,
      slope: parsed.slope ?? 0,
      fillRatioZ: parsed.fillRatioZ ?? 0.85,
      packingDensity: parsed.packingDensity ?? 0.8,
      materialType: parsed.materialType ?? '',
    }, parsed.truckType);
    return {
      ...parsed,
      estimatedVolumeM3: volume,
      estimatedTonnage: tonnage,
      ensembleCount: 1,
    };
  } catch (e) {
    throw new Error(`APIレスポンスのJSON解析に失敗しました: ${e instanceof Error ? e.message : String(e)}\nレスポンス先頭200文字: ${text.slice(0, 200)}`);
  }
}

export const analyzeGaraImageEnsemble = async (
  base64Images: string[],
  targetCount: number,
  _learningData: AnalysisHistory[] = [],  // @deprecated 未使用（後方互換性のため残す）
  onProgress: (current: number, result: EstimationResult) => void,
  abortSignal?: { cancelled: boolean },
  modelName: string = 'gemini-3-flash-preview',
  _taggedStock: StockItem[] = [],  // @deprecated 未使用（等級別選択に移行）
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

  notifyProgress({ phase: 'loading_references', detail: '登録車両データを読み込み中...' });

  const imageParts = base64Images.map(base64 => ({
    inlineData: { mimeType: 'image/jpeg', data: base64 }
  }));

  const results: EstimationResult[] = [];
  let lastError: Error | null = null;
  let gradedStock: GradedStockItem[] = [];
  let detectedTruckClass: TruckClass | null = null;

  // maxCapacityが指定されてる場合は最初から等級別データを取得
  if (maxCapacity) {
    detectedTruckClass = getTruckClass(maxCapacity);
    if (detectedTruckClass !== 'unknown') {
      notifyProgress({
        phase: 'loading_stock',
        detail: `${detectedTruckClass}クラスの実測データを取得中...`,
        current: 0,
        total: targetCount
      });
      gradedStock = await selectStockByGrade(detectedTruckClass);
      console.log(`等級別データ取得: ${detectedTruckClass}クラス, ${gradedStock.length}件`);
      if (gradedStock.length > 0) {
        notifyProgress({
          phase: 'loading_stock',
          detail: `実測データ ${gradedStock.length}件を参照`,
          current: 0,
          total: targetCount
        });
      }
    }
  }

  for (let i = 0; i < targetCount; i++) {
    if (abortSignal?.cancelled) break;

    // 1回目は等級別データなしで推論（車両クラス判定のため）
    // 2回目以降は等級別データありで推論
    const stockForInference = (i === 0 && !maxCapacity) ? [] : gradedStock;

    notifyProgress({
      phase: 'inference',
      detail: targetCount > 1
        ? `プロンプト構築中... (${i + 1}/${targetCount}回目)`
        : `プロンプト構築中...`,
      current: i + 1,
      total: targetCount
    });

    notifyProgress({
      phase: 'inference',
      detail: targetCount > 1
        ? `Gemini APIにリクエスト送信中... (${i + 1}/${targetCount}回目)${stockForInference.length > 0 ? ` [参照${stockForInference.length}件]` : ''}`
        : `Gemini APIにリクエスト送信中...${stockForInference.length > 0 ? ` [参照${stockForInference.length}件]` : ''}`,
      current: i + 1,
      total: targetCount
    });

    try {
      const res = await runSingleInference(ai, imageParts, modelName, maxCapacity, i, userFeedback, stockForInference, learningFeedback);

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

      // 1回目の結果から車両クラスを判定し、2回目以降用の等級別データを取得
      if (i === 0 && !maxCapacity && res.estimatedMaxCapacity) {
        detectedTruckClass = getTruckClass(res.estimatedMaxCapacity);
        if (detectedTruckClass !== 'unknown') {
          notifyProgress({
            phase: 'loading_stock',
            detail: `車両クラス判定: ${detectedTruckClass}（推定${res.estimatedMaxCapacity}t）`,
            current: i + 1,
            total: targetCount
          });
          notifyProgress({
            phase: 'loading_stock',
            detail: `${detectedTruckClass}クラスの実測データを取得中...`,
            current: i + 1,
            total: targetCount
          });
          gradedStock = await selectStockByGrade(detectedTruckClass);
          console.log(`1回目推論から車両クラス判定: ${detectedTruckClass}（推定${res.estimatedMaxCapacity}t）, 等級別データ${gradedStock.length}件`);
          if (gradedStock.length > 0) {
            notifyProgress({
              phase: 'loading_stock',
              detail: `実測データ ${gradedStock.length}件を参照`,
              current: i + 1,
              total: targetCount
            });
          }
        }
      }

      results.push(res);
      await saveCostEntry(modelName, imageParts.length, checkIsFreeTier());
      onProgress(results.length, res);
    } catch (err: unknown) {
      console.error(`推論エラー #${i + 1}:`, err);
      lastError = err instanceof Error ? err : new Error(String(err));
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
車両データは既知なので、積載物の幾何学的パラメータのみ抽出してください。

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
- height: 積載高さ m（0.05m刻み、後板=0.30m/ヒンジ=0.50mを目印）
- slope: 前後方向の高低差 m (0.0〜0.3)
- fillRatioL: 長さ方向の充填率 (0.7〜1.0)
- fillRatioW: 幅方向の充填率 (0.7〜1.0)
- fillRatioZ: 高さ方向の充填率 (0.7〜1.0)
- packingDensity: ガラの詰まり具合 (0.7〜0.9)
- surface_profile: 表面形状（flat/mounded/peaked）
` : `
あなたは積載量推定の専門家です。
この画像は実測 ${actualTonnage}t で、${tag === 'OK' ? '適正積載' : '過積載'}と判定されました。
${maxCapacity ? `最大積載量は ${maxCapacity}t です。` : ''}

【重量計算式】
${WEIGHT_FORMULA_PROMPT}

【タスク】
この画像から、実測${actualTonnage}tを再現するために必要な幾何学的パラメータを抽出してください。
重量計算はコード側で行うので、AIはパラメータ推定のみ行うこと。

【出力形式】JSON配列
[
  {
    "parameterName": "パラメータ名",
    "value": 数値または文字列,
    "unit": "単位（あれば）",
    "description": "このパラメータの意味",
    "reference": "測定基準（例: 後板高さ基準）"
  }
]

【必須パラメータ】
- material_type: 積載物の種類（土砂/As殻/Co殻/開粒度As殻/混合）
- height: 積載高さ m（0.05m刻み、後板=0.30m/ヒンジ=0.50mを目印）
- slope: 前後方向の高低差 m (0.0〜0.3)
- fillRatioL: 長さ方向の充填率 (0.7〜1.0)
- fillRatioW: 幅方向の充填率 (0.7〜1.0)
- fillRatioZ: 高さ方向の充填率 (0.7〜1.0)
- packingDensity: ガラの詰まり具合 (0.7〜0.9)
- surface_profile: 表面形状（flat/mounded/peaked）
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
