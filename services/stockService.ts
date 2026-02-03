import { StockItem, EstimationResult, isJudged } from '../types';
import { compressImage } from './imageUtils';
import * as idb from './indexedDBService';
import { LOAD_GRADES, getLoadGrade } from '../constants';

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
  await idb.updateStockAtomic(id, (item) => ({ ...item, ...updates }));
  stockCache = null;
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
  await idb.updateStockAtomic(id, (item) => {
    const estimations = item.estimations || [];
    estimations.unshift(estimation);
    return {
      ...item,
      estimations,
      result: estimation,
    };
  });
  stockCache = null;
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

// ========== 車両クラス判定 ==========

// 最大積載量から車両クラスを判定
export type TruckClass = '2t' | '4t' | '増トン' | '10t' | 'unknown';

export const getTruckClass = (maxCapacity: number): TruckClass => {
  if (maxCapacity >= 1.5 && maxCapacity <= 2.5) return '2t';
  if (maxCapacity >= 3.0 && maxCapacity <= 4.5) return '4t';
  if (maxCapacity >= 5.0 && maxCapacity <= 8.0) return '増トン';
  if (maxCapacity >= 9.0 && maxCapacity <= 12.0) return '10t';
  return 'unknown';
};

// ========== 等級別データ選択 ==========

export interface GradedStockItem extends StockItem {
  gradeName: string;    // 等級名
  loadRatio: number;    // 積載率（%）
}

// 車両クラスと等級で過去データを選択（各等級から最新1件）
export const selectStockByGrade = async (targetClass: TruckClass): Promise<GradedStockItem[]> => {
  const judgedItems = await getJudgedItems();

  // 同じ車両クラスでフィルタ
  const sameClassItems = judgedItems.filter(item => {
    if (!item.maxCapacity) return false;
    return getTruckClass(item.maxCapacity) === targetClass;
  });

  // 各アイテムに等級情報を付与
  const gradedItems: GradedStockItem[] = sameClassItems.map(item => {
    const loadRatio = (item.actualTonnage! / item.maxCapacity!) * 100;
    const grade = getLoadGrade(item.actualTonnage!, item.maxCapacity!);
    return {
      ...item,
      gradeName: grade.name,
      loadRatio,
    };
  });

  // 各等級から最新1件ずつ選択
  const result: GradedStockItem[] = [];
  for (const grade of LOAD_GRADES) {
    const itemsInGrade = gradedItems
      .filter(item => item.gradeName === grade.name)
      .sort((a, b) => b.timestamp - a.timestamp);  // 新しい順

    if (itemsInGrade.length > 0) {
      result.push(itemsInGrade[0]);
    }
  }

  return result;
};
