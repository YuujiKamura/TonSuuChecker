import { GoogleGenAI, Type } from "@google/genai";
import { saveCostEntry } from './costTracker';
import { EstimationResult, AnalysisHistory, StockItem, ExtractedFeature } from "../types";
import { SYSTEM_PROMPT } from "../constants";

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
  learningContext: any[],
  modelName: string
): Promise<EstimationResult> {
  const response = await ai.models.generateContent({
    model: modelName,
    contents: {
      parts: [...learningContext, ...imageParts, { text: "画像の内容を判定し、重量を推定してください。" }],
    },
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      temperature: 0.1,
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
        required: ["isTargetDetected", "truckType", "materialType", "estimatedVolumeM3", "estimatedTonnage", "confidenceScore", "reasoning", "materialBreakdown"]
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
    ensembleCount: count,
    reasoning: `【統合推論】有効サンプル:${resultCount}/${count}。${closestToAvg.reasoning}`
  };
}

export const getApiKey = (): string | null => {
  return localStorage.getItem('gemini_api_key');
};

export const setApiKey = (key: string): void => {
  localStorage.setItem('gemini_api_key', key);
};

export const clearApiKey = (): void => {
  localStorage.removeItem('gemini_api_key');
};

export const analyzeGaraImageEnsemble = async (
  base64Images: string[],
  targetCount: number,
  learningData: AnalysisHistory[] = [],
  onProgress: (current: number, result: EstimationResult) => void,
  abortSignal?: { cancelled: boolean },
  modelName: string = 'gemini-3-flash-preview',
  taggedStock: StockItem[] = []
): Promise<EstimationResult[]> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('APIキーが設定されていません');
  }
  const ai = new GoogleGenAI({ apiKey });
  // 実測データからの学習
  const historyContext = learningData
    .filter(h => h.actualTonnage !== undefined)
    .slice(0, 3)
    .map(h => ({
      text: `学習: ${h.result.licenseNumber} -> 実測${h.actualTonnage}t`
    }));

  // 特徴抽出済みストックからの学習（パラメータベース）
  const featureContext = taggedStock
    .filter(s => s.extractedFeatures && s.extractedFeatures.length > 0 && s.actualTonnage)
    .slice(0, 3)
    .map(s => {
      const featureStr = s.extractedFeatures!
        .map(f => `${f.parameterName}=${f.value}${f.unit || ''}`)
        .join(', ');
      return {
        text: `【参考データ】実測${s.actualTonnage}t（${s.tag === 'OK' ? '適正' : '過積載'}）の特徴: ${featureStr}`
      };
    });

  const learningContext = [...historyContext, ...featureContext];

  const imageParts = base64Images.map(base64 => ({
    inlineData: { mimeType: 'image/jpeg', data: base64 }
  }));

  const results: EstimationResult[] = [];

  for (let i = 0; i < targetCount; i++) {
    if (abortSignal?.cancelled) break;

    try {
      const res = await runSingleInference(ai, imageParts, learningContext, modelName);

      if (i === 0 && !res.isTargetDetected) {
        return [res];
      }

      results.push(res);
      saveCostEntry(modelName, imageParts.length);
      onProgress(results.length, res);
    } catch (err) {
      console.error(`推論エラー #${i + 1}:`, err);
    }
  }

  return results;
};

// 特徴抽出：正解付き画像から100kg精度推定に有効なパラメータを抽出
export const extractFeatures = async (
  base64Image: string,
  actualTonnage: number,
  tag: 'OK' | 'NG',
  maxCapacity?: number
): Promise<{ features: ExtractedFeature[]; rawResponse: string }> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('APIキーが設定されていません');
  }

  const ai = new GoogleGenAI({ apiKey });

  const prompt = `
あなたは積載量推定の専門家です。
この画像は実測 ${actualTonnage * 1000}kg で、${tag === 'OK' ? '適正積載' : '過積載'}と判定されました。
${maxCapacity ? `最大積載量は ${maxCapacity * 1000}kg です。` : ''}

【基準サイズ】
- 大型車ナンバープレート: 440mm x 220mm
- 普通車ナンバープレート: 330mm x 165mm
- 一般的なダンプ荷台内寸: 長さ約5m x 幅約2.2m x 深さ約50cm

【タスク】
100kg単位の精度で積載量を推定するために有効な視覚的パラメータを抽出してください。
**必ずナンバープレートや荷台寸法を基準とした相対値で表現すること。**

【出力形式】JSON配列
[
  {
    "parameterName": "パラメータ名（英語推奨）",
    "value": 数値または文字列,
    "unit": "単位（あれば）",
    "description": "このパラメータの意味と、なぜ重量推定に有効か",
    "reference": "何を基準にした値か（例: ナンバープレート幅基準）"
  }
]

【必須パラメータ】
- load_height_ratio: 荷台深さに対する積載高さの比率（0.0〜2.0+）
- load_volume_ratio: 荷台容積に対する積載体積の比率（0.0〜1.5+）
- surface_profile: 表面形状（flat/mounded/peaked）
- overhang_ratio: 荷台縁からのはみ出し量（ナンバープレート高さ基準）

【注意】
- 「約○cm」のような曖昧な絶対値は禁止
- 必ず基準物との比率・相対値で表現
- 5〜10個程度のパラメータを抽出
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
  saveCostEntry('gemini-2.0-flash', 1);

  try {
    const features = JSON.parse(rawResponse) as ExtractedFeature[];
    return { features, rawResponse };
  } catch {
    return { features: [], rawResponse };
  }
};

// 会話メッセージの型
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

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
  saveCostEntry(modelName, base64Images.length);

  return text;
};
