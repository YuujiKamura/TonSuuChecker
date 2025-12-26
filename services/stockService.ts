import { StockItem, EstimationResult, isJudged } from '../types';
import { compressImage } from './imageUtils';

const STORAGE_KEY = 'tonchecker_stock_v1';
const LEGACY_HISTORY_KEY = 'garaton_history_v4';

export const getStockItems = (): StockItem[] => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};

// 画像を圧縮してからストックに保存
export const saveStockItem = async (item: StockItem): Promise<boolean> => {
  try {
    const items = getStockItems();

    // base64Imagesを圧縮
    const compressedImages: string[] = [];
    for (const img of item.base64Images) {
      if (img) {
        const compressed = await compressImage(img, 800, 0.6);
        compressedImages.push(compressed);
      }
    }

    const compressedItem = {
      ...item,
      base64Images: compressedImages,
      imageUrls: compressedImages.map(b64 => 'data:image/jpeg;base64,' + b64)
    };

    items.unshift(compressedItem);
    // 最大50件まで保存
    const toSave = items.slice(0, 50);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    return true;
  } catch (e) {
    console.error('ストック保存エラー:', e);
    return false;
  }
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

// 判定済みアイテムを取得（actualTonnageとmaxCapacityが両方ある）
export const getJudgedItems = (): StockItem[] => {
  return getStockItems().filter(isJudged);
};

// 後方互換性のため残す（getJudgedItemsのエイリアス）
export const getTaggedItems = (): StockItem[] => {
  return getJudgedItems();
};

export const clearAllStock = (): void => {
  localStorage.removeItem(STORAGE_KEY);
};

// 履歴管理機能（解析結果があるストックアイテムを取得）
export const getHistoryItems = (): StockItem[] => {
  return getStockItems().filter(item => 
    (item.estimations && item.estimations.length > 0) || item.result !== undefined
  );
};

// 解析結果付きでストックに保存
export const saveAnalysisResult = (item: StockItem & { result: EstimationResult }): void => {
  saveStockItem(item);
};

// 解析結果を更新
export const updateAnalysisResult = (id: string, result: EstimationResult): void => {
  updateStockItem(id, { result });
};

// 新しい解析結果を追加（ランごとに履歴として保存）
export const addEstimation = (id: string, estimation: EstimationResult): void => {
  const items = getStockItems();
  const index = items.findIndex(item => item.id === id);
  if (index !== -1) {
    const item = items[index];
    const estimations = item.estimations || [];
    // 新しい推定結果を先頭に追加（最新が先頭）
    estimations.unshift(estimation);
    // 最新の推定結果もresultに保存（後方互換性）
    items[index] = {
      ...item,
      estimations,
      result: estimation,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }
};

// 最新の推定結果を取得
export const getLatestEstimation = (item: StockItem): EstimationResult | undefined => {
  // estimations配列が存在する場合は最新（先頭）を返す
  if (item.estimations && item.estimations.length > 0) {
    return item.estimations[0];
  }
  // 後方互換性のため、resultも確認
  return item.result;
};

// 既存の履歴データをストックに移行（初回のみ実行）
export const migrateLegacyHistory = (): void => {
  try {
    const legacyHistory = localStorage.getItem(LEGACY_HISTORY_KEY);
    if (!legacyHistory) return;

    const historyData = JSON.parse(legacyHistory);
    if (!Array.isArray(historyData) || historyData.length === 0) return;

    const existingStock = getStockItems();
    const existingIds = new Set(existingStock.map(item => item.id));

    // 履歴データをストックに変換
    const migratedItems: StockItem[] = historyData
      .filter((h: any) => h.result && !existingIds.has(h.id))
      .map((h: any) => ({
        id: h.id,
        timestamp: h.timestamp,
        base64Images: [], // 履歴にはbase64Imagesがないため空配列
        imageUrls: h.imageUrls || [],
        result: h.result, // 最新の推定結果（後方互換性）
        estimations: h.result ? [h.result] : [], // 推定結果の履歴
        actualTonnage: h.actualTonnage,
        maxCapacity: undefined,
        memo: h.description,
      }));

    if (migratedItems.length > 0) {
      const allItems = [...migratedItems, ...existingStock];
      // 最大50件まで保持（新しい順）
      const sorted = allItems.sort((a, b) => b.timestamp - a.timestamp).slice(0, 50);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sorted));
    }
    
    // 移行完了後、古い履歴データを削除（再度移行されないように）
    localStorage.removeItem(LEGACY_HISTORY_KEY);
  } catch (err) {
    console.error('履歴データの移行エラー:', err);
  }
};
