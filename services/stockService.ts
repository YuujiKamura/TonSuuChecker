import { StockItem, EstimationResult, isJudged } from '../types';
import { compressImage } from './imageUtils';
import * as idb from './indexedDBService';

// ========== ストック取得 ==========

export const getStockItems = async (): Promise<StockItem[]> => {
  return idb.getAllStock();
};

// 同期版（後方互換用、キャッシュから取得）
let stockCache: StockItem[] | null = null;

export const getStockItemsSync = (): StockItem[] => {
  return stockCache || [];
};

// キャッシュを更新
export const refreshStockCache = async (): Promise<StockItem[]> => {
  stockCache = await idb.getAllStock();
  return stockCache;
};

// ========== ストック保存 ==========

// 画像を圧縮してからストックに保存（件数制限なし）
export const saveStockItem = async (item: StockItem): Promise<boolean> => {
  try {
    // base64Imagesを圧縮
    const compressedImages: string[] = [];
    for (const img of item.base64Images) {
      if (img) {
        const compressed = await compressImage(img, 800, 0.6);
        compressedImages.push(compressed);
      }
    }

    const compressedItem: StockItem = {
      ...item,
      base64Images: compressedImages,
      imageUrls: compressedImages.map(b64 => 'data:image/jpeg;base64,' + b64)
    };

    await idb.saveStock(compressedItem);
    stockCache = null; // キャッシュ無効化
    return true;
  } catch (e) {
    console.error('ストック保存エラー:', e);
    return false;
  }
};

// ========== ストック更新 ==========

export const updateStockItem = async (id: string, updates: Partial<StockItem>): Promise<void> => {
  const item = await idb.getStockById(id);
  if (item) {
    await idb.saveStock({ ...item, ...updates });
    stockCache = null;
  }
};

// ========== ストック削除 ==========

export const deleteStockItem = async (id: string): Promise<void> => {
  await idb.deleteStock(id);
  stockCache = null;
};

// ========== 判定済みアイテム ==========

export const getJudgedItems = async (): Promise<StockItem[]> => {
  const items = await getStockItems();
  return items.filter(isJudged);
};

// 後方互換性のため残す
export const getTaggedItems = async (): Promise<StockItem[]> => {
  return getJudgedItems();
};

// ========== 全削除 ==========

export const clearAllStock = async (): Promise<void> => {
  await idb.clearAllStock();
  stockCache = null;
};

// ========== 履歴管理 ==========

export const getHistoryItems = async (): Promise<StockItem[]> => {
  const items = await getStockItems();
  return items.filter(item =>
    (item.estimations && item.estimations.length > 0) || item.result !== undefined
  );
};

// ========== 解析結果保存 ==========

export const saveAnalysisResult = async (item: StockItem & { result: EstimationResult }): Promise<void> => {
  await saveStockItem(item);
};

export const updateAnalysisResult = async (id: string, result: EstimationResult): Promise<void> => {
  await updateStockItem(id, { result });
};

// ========== 推定結果追加 ==========

export const addEstimation = async (id: string, estimation: EstimationResult): Promise<void> => {
  const item = await idb.getStockById(id);
  if (item) {
    const estimations = item.estimations || [];
    estimations.unshift(estimation);
    await idb.saveStock({
      ...item,
      estimations,
      result: estimation,
    });
    stockCache = null;
  }
};

// ========== 最新推定結果取得 ==========

export const getLatestEstimation = (item: StockItem): EstimationResult | undefined => {
  if (item.estimations && item.estimations.length > 0) {
    return item.estimations[0];
  }
  return item.result;
};

// ========== ストック件数取得 ==========

export const getStockCount = async (): Promise<number> => {
  return idb.getStockCount();
};

// ========== マイグレーション（レガシー） ==========

// 既存の履歴データをストックに移行（IndexedDBへのマイグレーションで処理済み）
export const migrateLegacyHistory = (): void => {
  // IndexedDBマイグレーションで処理するため空実装
};

// 既存のストックデータを圧縮（IndexedDBへのマイグレーションで処理済み）
export const compressExistingStock = async (): Promise<void> => {
  // IndexedDBマイグレーションで処理するため空実装
};
