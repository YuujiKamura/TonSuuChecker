// Gemini API コスト追跡サービス

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

const STORAGE_KEY = 'gemini_api_cost_history';

export const getCostHistory = (): CostEntry[] => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      return [];
    }
  }
  return [];
};

export const saveCostEntry = (model: string, imageCount: number = 1, isFreeTier: boolean = false): CostEntry => {
  const history = getCostHistory();
  const costPerCall = isFreeTier ? 0 : (COST_PER_CALL[model] || COST_PER_CALL['default']);
  
  const entry: CostEntry = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    model,
    callCount: 1,
    estimatedCost: costPerCall * imageCount,
    imageCount
  };
  
  history.push(entry);
  
  // 最大1000件まで保持
  const trimmed = history.slice(-1000);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  
  return entry;
};

export const getTotalCost = (): number => {
  const history = getCostHistory();
  return history.reduce((sum, entry) => sum + entry.estimatedCost, 0);
};

export const getTodayCost = (): number => {
  const history = getCostHistory();
  const today = new Date().toDateString();
  return history
    .filter(entry => new Date(entry.timestamp).toDateString() === today)
    .reduce((sum, entry) => sum + entry.estimatedCost, 0);
};

export const getDailyCosts = (days: number = 7): DailyCost[] => {
  const history = getCostHistory();
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

export const getModelBreakdown = (): { model: string; cost: number; count: number }[] => {
  const history = getCostHistory();
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

export const clearCostHistory = (): void => {
  localStorage.removeItem(STORAGE_KEY);
};
