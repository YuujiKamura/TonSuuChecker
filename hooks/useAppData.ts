import React, { useState, useEffect } from 'react';
import { refreshStockCache } from '../services/stockService';
import { refreshVehicleCache } from '../services/referenceImages';
import { getTodayCost, refreshCostCache } from '../services/costTracker';
import { migrateFromLocalStorage, requestPersistentStorage, getIndexedDBUsage } from '../services/indexedDBService';
import { getApiKey, isGoogleAIStudioKey } from '../services/geminiService';
import { validateApiKey, ApiKeyStatus } from '../services/configService';
import { initFromUrlParams } from '../services/sheetSync';
import { StockItem } from '../types';

export type { ApiKeyStatus } from '../services/configService';

export interface UseAppDataReturn {
  // Settings
  ensembleTarget: number;
  setEnsembleTarget: React.Dispatch<React.SetStateAction<number>>;
  selectedModel: 'gemini-3-flash-preview' | 'gemini-3-pro-preview';
  setSelectedModel: React.Dispatch<React.SetStateAction<'gemini-3-flash-preview' | 'gemini-3-pro-preview'>>;

  // API key
  hasApiKey: boolean;
  setHasApiKey: React.Dispatch<React.SetStateAction<boolean>>;
  isGoogleAIStudio: boolean;
  setIsGoogleAIStudio: React.Dispatch<React.SetStateAction<boolean>>;
  apiKeyStatus: ApiKeyStatus;
  checkApiKey: () => Promise<void>;

  // Cost
  todaysCost: number;
  refreshCost: () => Promise<void>;

  // Storage
  storageUsed: number;
  storageQuota: number;

  // Stock
  stockItems: StockItem[];
  refreshStock: () => Promise<void>;
}

export default function useAppData(): UseAppDataReturn {
  // Settings
  const [ensembleTarget, setEnsembleTarget] = useState(() => {
    const saved = localStorage.getItem('tonchecker_ensemble_target');
    return saved ? parseInt(saved) : 1;
  });
  const [selectedModel, setSelectedModel] = useState<'gemini-3-flash-preview' | 'gemini-3-pro-preview'>(() => {
    const saved = localStorage.getItem('tonchecker_model');
    return (saved as 'gemini-3-flash-preview' | 'gemini-3-pro-preview') || 'gemini-3-flash-preview';
  });

  // API key
  const [hasApiKey, setHasApiKey] = useState(false);
  const [isGoogleAIStudio, setIsGoogleAIStudio] = useState(false);
  const [apiKeyStatus, setApiKeyStatus] = useState<ApiKeyStatus>('unchecked');
  const [todaysCost, setTodaysCost] = useState(0);

  // Storage
  const [storageUsed, setStorageUsed] = useState<number>(0);
  const [storageQuota, setStorageQuota] = useState<number>(0);

  // Stock
  const [stockItems, setStockItems] = useState<StockItem[]>([]);

  // コスト更新（解析完了後）
  const refreshCost = async () => {
    const cost = await getTodayCost();
    setTodaysCost(cost);
  };

  // ストック更新
  const refreshStock = async () => {
    const items = await refreshStockCache();
    setStockItems(items);
    // ストレージ使用量も更新
    const usage = await getIndexedDBUsage();
    setStorageUsed(usage.used);
    setStorageQuota(usage.quota);
  };

  // APIキーの有効性を検証
  const checkApiKey = async () => {
    setApiKeyStatus('checking');
    const status = await validateApiKey();
    setApiKeyStatus(status);
    // If validation reveals the key is missing/invalid, also update hasApiKey
    if (status === 'missing' || status === 'invalid' || status === 'expired') {
      setHasApiKey(status !== 'missing' && status !== 'invalid');
    }
  };

  // APIキーの状態を初期化時にチェック
  useEffect(() => {
    const initializeApp = async () => {
      const apiKey = getApiKey();
      setHasApiKey(!!apiKey);

      // 非同期でキーの有効性を検証（UIブロックしない）
      if (apiKey) {
        validateApiKey().then(status => {
          setApiKeyStatus(status);
        });
      } else {
        setApiKeyStatus('missing');
      }

      // 既存のキーがあるが、ソースが不明な場合は確認を促す
      if (apiKey && !isGoogleAIStudioKey() && !localStorage.getItem('gemini_api_key_source')) {
        // ソースが不明な場合は、ユーザーに確認を求めるためにモーダルを表示
        // ただし、初回起動時は自動的に表示しない（ユーザーが設定を開いたときに確認）
      } else {
        setIsGoogleAIStudio(isGoogleAIStudioKey());
      }

      // LocalStorage -> IndexedDB マイグレーション（初回のみ）
      await migrateFromLocalStorage();

      // 永続化をリクエスト（モバイルでの自動削除を防ぐ）
      requestPersistentStorage().then(granted => {
        if (granted) console.log('永続ストレージが許可されました');
      });

      // キャッシュを更新してデータを読み込み
      const [items, cost, , , usage] = await Promise.all([
        refreshStockCache(),
        getTodayCost(),
        refreshVehicleCache(),
        refreshCostCache(),
        getIndexedDBUsage()
      ]);

      setStockItems(items);
      setTodaysCost(cost);
      setStorageUsed(usage.used);
      setStorageQuota(usage.quota);

      // URLパラメータからGAS URLを読み込み
      initFromUrlParams();
    };

    initializeApp();
  }, []);

  return {
    // Settings
    ensembleTarget,
    setEnsembleTarget,
    selectedModel,
    setSelectedModel,

    // API key
    hasApiKey,
    setHasApiKey,
    isGoogleAIStudio,
    setIsGoogleAIStudio,
    apiKeyStatus,
    checkApiKey,

    // Cost
    todaysCost,
    refreshCost,

    // Storage
    storageUsed,
    storageQuota,

    // Stock
    stockItems,
    refreshStock,
  };
}
