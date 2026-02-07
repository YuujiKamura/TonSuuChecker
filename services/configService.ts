import { GoogleGenAI } from "@google/genai";

// APIキーがGoogle AI Studioの無料枠かどうかをチェック
export const checkIsFreeTier = (): boolean => {
  return localStorage.getItem('gemini_api_key_source') === 'google_ai_studio';
};

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

// 既存のAPIキーから自動判定を試みる（軽量なAP呼び出しで判定）
export const detectApiKeySource = async (): Promise<'google_ai_studio' | 'other' | 'unknown'> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    return 'unknown';
  }

  const existingSource = localStorage.getItem('gemini_api_key_source');
  if (existingSource === 'google_ai_studio' || existingSource === 'other') {
    return existingSource as 'google_ai_studio' | 'other';
  }

  if (!apiKey.startsWith('AIza')) {
    return 'unknown';
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    return 'unknown';
  } catch {
    return 'unknown';
  }
};
