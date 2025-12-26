// 車検証解析サービス - PDFまたは画像から車両情報を抽出

import { GoogleGenAI, Type } from "@google/genai";
import { getApiKey } from './geminiService';
import { saveCostEntry } from './costTracker';

export interface ShakenResult {
  vehicleName: string;      // 車名・型式
  maxCapacity: number;      // 最大積載量（トン）
  vehicleType?: string;     // 車両の種別
  registrationNumber?: string; // 登録番号
}

export const analyzeShaken = async (
  base64Data: string,
  mimeType: string
): Promise<ShakenResult | null> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('APIキーが設定されていません');
  }

  const ai = new GoogleGenAI({ apiKey });

  const prompt = `この画像は日本の自動車検査証（車検証）です。
以下の情報を読み取ってJSON形式で回答してください。

必須項目：
- vehicleName: 車名と型式（例: "日野 プロフィア"、"いすゞ ギガ"）
- maxCapacity: 最大積載量（キログラム表記を トン に変換。例: 10000kg → 10）

オプション項目：
- vehicleType: 用途（貨物、特種など）
- registrationNumber: 登録番号（ナンバープレート）

読み取れない項目は省略してください。
最大積載量は必ず「トン」単位の数値で返してください。`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: {
        parts: [
          { inlineData: { mimeType, data: base64Data } },
          { text: prompt }
        ],
      },
      config: {
        responseMimeType: "application/json",
        temperature: 0.1,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            vehicleName: { type: Type.STRING },
            maxCapacity: { type: Type.NUMBER },
            vehicleType: { type: Type.STRING, nullable: true },
            registrationNumber: { type: Type.STRING, nullable: true },
          },
          required: ["vehicleName", "maxCapacity"]
        }
      }
    });

    const text = response.text;
    if (!text) return null;

    await saveCostEntry('gemini-2.0-flash', 1, localStorage.getItem('gemini_api_key_source') === 'google_ai_studio');

    return JSON.parse(text) as ShakenResult;
  } catch (err) {
    console.error('車検証解析エラー:', err);
    return null;
  }
};
