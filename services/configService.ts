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

