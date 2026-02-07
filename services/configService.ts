import { GoogleGenAI } from "@google/genai";

export type ApiKeyStatus = 'unchecked' | 'checking' | 'valid' | 'invalid' | 'expired' | 'quota_exceeded' | 'missing';

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

/**
 * APIキーの有効性を軽量なAPI呼び出しで検証する。
 * models.get() を使用（トークン消費なし）。
 */
export const validateApiKey = async (): Promise<ApiKeyStatus> => {
  const apiKey = getApiKey();
  if (!apiKey) return 'missing';

  try {
    const ai = new GoogleGenAI({ apiKey });
    // 軽量な検証: モデル情報を取得（トークン消費なし）
    await ai.models.get({ model: 'gemini-2.0-flash' });
    return 'valid';
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const fullError = String(err);
    if (fullError.includes('API_KEY_INVALID') || message.includes('API key expired')) {
      return message.includes('expired') ? 'expired' : 'invalid';
    }
    if (message.includes('429') || message.includes('quota') || message.includes('RESOURCE_EXHAUSTED')) {
      return 'quota_exceeded';
    }
    // ネットワークエラー等は valid として扱う（キー自体の問題ではない可能性）
    return 'valid';
  }
};

