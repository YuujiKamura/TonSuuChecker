// スプレッドシート同期サービス（メタデータのみ）

export interface TaggedRecord {
  id: string;
  timestamp: number;
  licensePlate?: string;
  memo?: string;
  tag: 'OK' | 'NG';
  userName?: string;
}

export interface SyncData {
  version: string;
  syncDate: string;
  items: TaggedRecord[];
}

const GAS_URL_KEY = 'tonchecker_gas_url';

export const getGasUrl = (): string | null => {
  return localStorage.getItem(GAS_URL_KEY);
};

export const setGasUrl = (url: string): void => {
  localStorage.setItem(GAS_URL_KEY, url);
};

export const clearGasUrl = (): void => {
  localStorage.removeItem(GAS_URL_KEY);
};

// URLパラメータからGAS URLを読み込んで自動接続
export const initFromUrlParams = (): boolean => {
  const params = new URLSearchParams(window.location.search);
  const gasUrl = params.get('gas');
  if (gasUrl) {
    setGasUrl(gasUrl);
    // URLからパラメータを削除（履歴を汚さない）
    const cleanUrl = window.location.pathname + window.location.hash;
    window.history.replaceState({}, '', cleanUrl);
    return true;
  }
  return false;
};

// 共有URL生成
export const generateShareUrl = (): string | null => {
  const gasUrl = getGasUrl();
  if (!gasUrl) return null;
  const baseUrl = window.location.origin + window.location.pathname;
  return `${baseUrl}?gas=${encodeURIComponent(gasUrl)}`;
};

// シートからデータ取得
export const fetchFromSheet = async (): Promise<SyncData | null> => {
  const gasUrl = getGasUrl();
  if (!gasUrl) return null;

  try {
    const response = await fetch(gasUrl);
    if (!response.ok) throw new Error('Fetch failed');
    const data = await response.json();
    return data as SyncData;
  } catch (err) {
    console.error('シート取得エラー:', err);
    return null;
  }
};

// シートにデータ保存
export const syncToSheet = async (items: TaggedRecord[]): Promise<boolean> => {
  const gasUrl = getGasUrl();
  if (!gasUrl) return false;

  const data: SyncData = {
    version: '1.0',
    syncDate: new Date().toISOString(),
    items
  };

  try {
    const params = new URLSearchParams();
    params.append('data', JSON.stringify(data));
    await fetch(gasUrl, {
      method: 'POST',
      mode: 'no-cors',
      body: params
    });
    return true;
  } catch (err) {
    console.error('シート同期エラー:', err);
    return false;
  }
};

// ローカルのタグ付きストックからメタデータを抽出
export const extractMetadata = (stockItems: Array<{
  id: string;
  timestamp: number;
  tag?: 'OK' | 'NG';
  memo?: string;
}>): TaggedRecord[] => {
  return stockItems
    .filter(item => item.tag !== undefined)
    .map(item => ({
      id: item.id,
      timestamp: item.timestamp,
      tag: item.tag!,
      memo: item.memo,
      userName: localStorage.getItem('tonchecker_username') || undefined
    }));
};
