// Gemini API コスト追跡サービス - IndexedDB版
import * as idb from './indexedDBService';

export interface CostEntry {
  id: string;
  timestamp: number;
  model: string;
  callCount: number;
  estimatedCost: number;  // USD
  imageCount: number;
}

export interface DailyCost {
  date: string;
  totalCost: number;
  callCount: number;
}

// モデルごとの推定コスト（1回の呼び出しあたり、USD）
const COST_PER_CALL: Record<string, number> = {
  'gemini-3-flash-preview': 0.0005,
  'gemini-flash-lite-latest': 0.0002,
  'gemini-3-pro-preview': 0.005,
  'default': 0.001
};

// 為替レート（おおよそ）
const EXCHANGE_RATES: Record<string, number> = {
  'USD': 1,
  'JPY': 150,
  'EUR': 0.92,
  'GBP': 0.79,
};

// ブラウザの言語から通貨を判定
export const getCurrency = (): { code: string; symbol: string; rate: number } => {
  const lang = navigator.language || 'en-US';

  if (lang.startsWith('ja')) {
    return { code: 'JPY', symbol: '¥', rate: EXCHANGE_RATES['JPY'] };
  } else if (lang.startsWith('en-GB')) {
    return { code: 'GBP', symbol: '£', rate: EXCHANGE_RATES['GBP'] };
  } else if (lang.startsWith('de') || lang.startsWith('fr') || lang.startsWith('es') || lang.startsWith('it')) {
    return { code: 'EUR', symbol: '€', rate: EXCHANGE_RATES['EUR'] };
  }
  return { code: 'USD', symbol: '$', rate: EXCHANGE_RATES['USD'] };
};

// コストをローカル通貨でフォーマット
export const formatCost = (usdAmount: number): string => {
  const currency = getCurrency();
  const localAmount = usdAmount * currency.rate;

  if (currency.code === 'JPY') {
    // 円は小数点なし
    if (localAmount < 1) {
      return currency.symbol + localAmount.toFixed(2);
    }
    return currency.symbol + Math.round(localAmount).toLocaleString();
  }

  return currency.symbol + localAmount.toFixed(4);
};

// コスト履歴キャッシュ
let costCache: CostEntry[] | null = null;

export const getCostHistory = async (): Promise<CostEntry[]> => {
  if (costCache) return costCache;
  costCache = await idb.getAllCostHistory();
  return costCache;
};

// 同期版（キャッシュから取得）
export const getCostHistorySync = (): CostEntry[] => {
  return costCache || [];
};

export const refreshCostCache = async (): Promise<CostEntry[]> => {
  costCache = await idb.getAllCostHistory();
  return costCache;
};

export const saveCostEntry = async (model: string, imageCount: number = 1, isFreeTier: boolean = false): Promise<CostEntry> => {
  const costPerCall = isFreeTier ? 0 : (COST_PER_CALL[model] || COST_PER_CALL['default']);

  const entry: CostEntry = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    model,
    callCount: 1,
    estimatedCost: costPerCall * imageCount,
    imageCount
  };

  await idb.saveCostEntry(entry);
  costCache = null; // キャッシュ無効化

  return entry;
};

export const getTotalCost = async (): Promise<number> => {
  const history = await getCostHistory();
  return history.reduce((sum, entry) => sum + entry.estimatedCost, 0);
};

export const getTodayCost = async (): Promise<number> => {
  const history = await getCostHistory();
  const today = new Date().toDateString();
  return history
    .filter(entry => new Date(entry.timestamp).toDateString() === today)
    .reduce((sum, entry) => sum + entry.estimatedCost, 0);
};

export const getDailyCosts = async (days: number = 7): Promise<DailyCost[]> => {
  const history = await getCostHistory();
  const result: Map<string, DailyCost> = new Map();

  // 過去N日分の日付を生成
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    result.set(dateStr, { date: dateStr, totalCost: 0, callCount: 0 });
  }

  // 履歴からコストを集計
  history.forEach(entry => {
    const dateStr = new Date(entry.timestamp).toISOString().split('T')[0];
    if (result.has(dateStr)) {
      const daily = result.get(dateStr)!;
      daily.totalCost += entry.estimatedCost;
      daily.callCount += entry.callCount;
    }
  });

  return Array.from(result.values());
};

export const getModelBreakdown = async (): Promise<{ model: string; cost: number; count: number }[]> => {
  const history = await getCostHistory();
  const breakdown: Map<string, { cost: number; count: number }> = new Map();

  history.forEach(entry => {
    const existing = breakdown.get(entry.model) || { cost: 0, count: 0 };
    existing.cost += entry.estimatedCost;
    existing.count += entry.callCount;
    breakdown.set(entry.model, existing);
  });

  return Array.from(breakdown.entries()).map(([model, data]) => ({
    model,
    ...data
  }));
};

export const clearCostHistory = async (): Promise<void> => {
  await idb.clearCostHistory();
  costCache = null;
};
