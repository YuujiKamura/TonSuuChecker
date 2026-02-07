// スプレッドシート同期サービス（画像・実測データ含む）

import { StockItem } from '../types';
import { getJudgmentStatus } from '../utils/judgment';

export interface SyncRecord {
  id: string;
  timestamp: number;
  licensePlate?: string;
  licenseNumber?: string;
  memo?: string;
  // 判定データ
  actualTonnage?: number;       // 実測値
  maxCapacity?: number;         // ユーザー指定の最大積載量
  // AI推定データ
  estimatedTonnage?: number;    // AI推定重量
  estimatedMaxCapacity?: number; // AI推定最大積載量
  estimatedVolumeM3?: number;   // AI推定体積
  truckType?: string;           // 車両タイプ
  materialType?: string;        // 積載物
  // 画像
  imageBase64?: string;         // 送信時のみ使用
  imageUrl?: string;            // Drive保存後のURL
  // メタ
  userName?: string;
}

// 後方互換性のため残す
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

// ローカルのタグ付きストックからメタデータを抽出（後方互換）
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

// StockItemから同期用レコードを作成（画像含む）
export const createSyncRecord = (item: StockItem, includeImage: boolean = true): SyncRecord => {
  const latestResult = item.estimations?.[0] || item.result;

  return {
    id: item.id,
    timestamp: item.timestamp,
    licensePlate: latestResult?.licensePlate,
    licenseNumber: latestResult?.licenseNumber,
    memo: item.memo,
    // 判定データ
    actualTonnage: item.actualTonnage,
    maxCapacity: item.maxCapacity,
    // AI推定
    estimatedTonnage: latestResult?.estimatedTonnage,
    estimatedMaxCapacity: latestResult?.estimatedMaxCapacity,
    estimatedVolumeM3: latestResult?.estimatedVolumeM3,
    truckType: latestResult?.truckType,
    materialType: latestResult?.materialType,
    // 画像（base64、送信時のみ）
    imageBase64: includeImage ? item.base64Images[0] : undefined,
    // メタ
    userName: localStorage.getItem('tonchecker_username') || undefined
  };
};

// 単一レコードを送信（画像付き）
export const syncRecordToSheet = async (record: SyncRecord): Promise<{ success: boolean; imageUrl?: string }> => {
  const gasUrl = getGasUrl();
  if (!gasUrl) return { success: false };

  try {
    const response = await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'addRecord', record }),
      mode: 'cors'  // CORSが必要
    });

    // GASがJSONを返す場合
    try {
      const result = await response.json();
      return { success: true, imageUrl: result.imageUrl };
    } catch {
      // no-corsの場合はレスポンスが読めない
      return { success: true };
    }
  } catch (err) {
    console.error('レコード同期エラー:', err);
    return { success: false };
  }
};
