import { StockItem } from '../types';

const STORAGE_KEY = 'tonchecker_stock_v1';

export const getStockItems = (): StockItem[] => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};

export const saveStockItem = (item: StockItem): void => {
  const items = getStockItems();
  items.unshift(item);
  // 最大50件まで保存
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 50)));
};

export const updateStockItem = (id: string, updates: Partial<StockItem>): void => {
  const items = getStockItems();
  const index = items.findIndex(item => item.id === id);
  if (index !== -1) {
    items[index] = { ...items[index], ...updates };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }
};

export const deleteStockItem = (id: string): void => {
  const items = getStockItems().filter(item => item.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
};

export const getTaggedItems = (): StockItem[] => {
  return getStockItems().filter(item => item.tag !== undefined);
};

export const clearAllStock = (): void => {
  localStorage.removeItem(STORAGE_KEY);
};
