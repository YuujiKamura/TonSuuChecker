// IndexedDB サービス - idb ラッパーを使用
import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { StockItem, EstimationResult, LearningFeedback } from '../types';
import { RegisteredVehicle } from './referenceImages';

// DB スキーマ定義
interface TonCheckerDB extends DBSchema {
  stock: {
    key: string;
    value: StockItem;
    indexes: { 'by-timestamp': number };
  };
  vehicles: {
    key: string;
    value: RegisteredVehicle;
  };
  chatHistory: {
    key: string;
    value: {
      analysisId: string;
      messages: Array<{ role: string; content: string }>;
    };
  };
  costHistory: {
    key: string;
    value: {
      id: string;
      timestamp: number;
      model: string;
      callCount: number;
      estimatedCost: number;
      imageCount: number;
    };
    indexes: { 'by-timestamp': number };
  };
  settings: {
    key: string;
    value: any;
  };
  learningFeedback: {
    key: string;
    value: LearningFeedback;
    indexes: { 'by-timestamp': number; 'by-type': string };
  };
}

const DB_NAME = 'TonCheckerDB';
const DB_VERSION = 2;

let dbInstance: IDBPDatabase<TonCheckerDB> | null = null;

// DB接続を取得（シングルトン）
export const getDB = async (): Promise<IDBPDatabase<TonCheckerDB>> => {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<TonCheckerDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // ストックストア（タイムスタンプでインデックス）
      if (!db.objectStoreNames.contains('stock')) {
        const stockStore = db.createObjectStore('stock', { keyPath: 'id' });
        stockStore.createIndex('by-timestamp', 'timestamp');
      }

      // 車両ストア
      if (!db.objectStoreNames.contains('vehicles')) {
        db.createObjectStore('vehicles', { keyPath: 'id' });
      }

      // チャット履歴ストア
      if (!db.objectStoreNames.contains('chatHistory')) {
        db.createObjectStore('chatHistory', { keyPath: 'analysisId' });
      }

      // コスト履歴ストア
      if (!db.objectStoreNames.contains('costHistory')) {
        const costStore = db.createObjectStore('costHistory', { keyPath: 'id' });
        costStore.createIndex('by-timestamp', 'timestamp');
      }

      // 設定ストア（キーバリュー形式）
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings');
      }

      // 学習フィードバックストア（v2で追加）
      if (!db.objectStoreNames.contains('learningFeedback')) {
        const feedbackStore = db.createObjectStore('learningFeedback', { keyPath: 'id' });
        feedbackStore.createIndex('by-timestamp', 'timestamp');
        feedbackStore.createIndex('by-type', 'feedbackType');
      }
    },
  });

  return dbInstance;
};

// ========== ストック操作 ==========

export const getAllStock = async (): Promise<StockItem[]> => {
  const db = await getDB();
  const items = await db.getAllFromIndex('stock', 'by-timestamp');
  // 新しい順にソート
  return items.reverse();
};

export const getStockById = async (id: string): Promise<StockItem | undefined> => {
  const db = await getDB();
  return db.get('stock', id);
};

export const saveStock = async (item: StockItem): Promise<void> => {
  const db = await getDB();
  await db.put('stock', item);
};

export const deleteStock = async (id: string): Promise<void> => {
  const db = await getDB();
  await db.delete('stock', id);
};

// アトミックな更新を行う関数
export const updateStockAtomic = async (
  id: string,
  updater: (item: StockItem) => StockItem
): Promise<StockItem | null> => {
  const db = await getDB();
  const tx = db.transaction('stock', 'readwrite');
  const store = tx.objectStore('stock');

  const item = await store.get(id);
  if (!item) {
    await tx.done;
    return null;
  }

  const updated = updater(item);
  await store.put(updated);
  await tx.done;
  return updated;
};

export const clearAllStock = async (): Promise<void> => {
  const db = await getDB();
  await db.clear('stock');
};

export const getStockCount = async (): Promise<number> => {
  const db = await getDB();
  return db.count('stock');
};

// ========== 車両操作 ==========

export const getAllVehicles = async (): Promise<RegisteredVehicle[]> => {
  const db = await getDB();
  return db.getAll('vehicles');
};

export const getVehicleById = async (id: string): Promise<RegisteredVehicle | undefined> => {
  const db = await getDB();
  return db.get('vehicles', id);
};

export const saveVehicle = async (vehicle: RegisteredVehicle): Promise<void> => {
  const db = await getDB();
  await db.put('vehicles', vehicle);
};

export const deleteVehicleById = async (id: string): Promise<void> => {
  const db = await getDB();
  await db.delete('vehicles', id);
};

// ========== チャット履歴操作 ==========

export const getChatHistory = async (analysisId: string): Promise<Array<{ role: string; content: string }>> => {
  const db = await getDB();
  const record = await db.get('chatHistory', analysisId);
  return record?.messages || [];
};

export const saveChatHistory = async (analysisId: string, messages: Array<{ role: string; content: string }>): Promise<void> => {
  const db = await getDB();
  await db.put('chatHistory', { analysisId, messages });
};

export const getAllChatHistories = async (): Promise<Record<string, Array<{ role: string; content: string }>>> => {
  const db = await getDB();
  const all = await db.getAll('chatHistory');
  const result: Record<string, Array<{ role: string; content: string }>> = {};
  for (const item of all) {
    result[item.analysisId] = item.messages;
  }
  return result;
};

// ========== コスト履歴操作 ==========

interface CostEntry {
  id: string;
  timestamp: number;
  model: string;
  callCount: number;
  estimatedCost: number;
  imageCount: number;
}

export const getAllCostHistory = async (): Promise<CostEntry[]> => {
  const db = await getDB();
  const items = await db.getAllFromIndex('costHistory', 'by-timestamp');
  return items.reverse();
};

export const saveCostEntry = async (entry: CostEntry): Promise<void> => {
  const db = await getDB();
  await db.put('costHistory', entry);
};

export const clearCostHistory = async (): Promise<void> => {
  const db = await getDB();
  await db.clear('costHistory');
};

// ========== 設定操作 ==========

export const getSetting = async <T>(key: string): Promise<T | undefined> => {
  const db = await getDB();
  return db.get('settings', key) as Promise<T | undefined>;
};

export const saveSetting = async (key: string, value: any): Promise<void> => {
  const db = await getDB();
  await db.put('settings', value, key);
};

export const deleteSetting = async (key: string): Promise<void> => {
  const db = await getDB();
  await db.delete('settings', key);
};

// ========== マイグレーション ==========

const MIGRATION_FLAG = 'tonchecker_indexeddb_migrated_v1';

export const migrateFromLocalStorage = async (): Promise<void> => {
  // 既にマイグレーション済みならスキップ
  if (localStorage.getItem(MIGRATION_FLAG)) return;

  console.log('IndexedDBへのマイグレーションを開始...');

  try {
    // ストックデータの移行
    const stockData = localStorage.getItem('tonchecker_stock_v1');
    if (stockData) {
      const items: StockItem[] = JSON.parse(stockData);
      const db = await getDB();
      const tx = db.transaction('stock', 'readwrite');
      for (const item of items) {
        await tx.store.put(item);
      }
      await tx.done;
      console.log(`ストック ${items.length}件 を移行完了`);
    }

    // 車両データの移行
    const vehicleData = localStorage.getItem('tonchecker_registered_vehicles');
    if (vehicleData) {
      const vehicles: RegisteredVehicle[] = JSON.parse(vehicleData);
      const db = await getDB();
      const tx = db.transaction('vehicles', 'readwrite');
      for (const vehicle of vehicles) {
        await tx.store.put(vehicle);
      }
      await tx.done;
      console.log(`車両 ${vehicles.length}件 を移行完了`);
    }

    // チャット履歴の移行
    const chatData = localStorage.getItem('garaton_chat_history');
    if (chatData) {
      const chats: Record<string, Array<{ role: string; content: string }>> = JSON.parse(chatData);
      const db = await getDB();
      const tx = db.transaction('chatHistory', 'readwrite');
      for (const [analysisId, messages] of Object.entries(chats)) {
        await tx.store.put({ analysisId, messages });
      }
      await tx.done;
      console.log(`チャット履歴 ${Object.keys(chats).length}件 を移行完了`);
    }

    // コスト履歴の移行
    const costData = localStorage.getItem('gemini_api_cost_history');
    if (costData) {
      const costs: CostEntry[] = JSON.parse(costData);
      const db = await getDB();
      const tx = db.transaction('costHistory', 'readwrite');
      for (const entry of costs) {
        await tx.store.put(entry);
      }
      await tx.done;
      console.log(`コスト履歴 ${costs.length}件 を移行完了`);
    }

    // マイグレーション完了フラグを設定
    localStorage.setItem(MIGRATION_FLAG, 'true');
    console.log('IndexedDBへのマイグレーション完了！');

    // 古いLocalStorageデータを削除（容量解放）
    localStorage.removeItem('tonchecker_stock_v1');
    localStorage.removeItem('tonchecker_registered_vehicles');
    localStorage.removeItem('garaton_chat_history');
    localStorage.removeItem('gemini_api_cost_history');
    localStorage.removeItem('tonchecker_stock_compressed_v2');
    localStorage.removeItem('tonchecker_vehicles_compressed_v1');
    console.log('古いLocalStorageデータを削除しました');

  } catch (err) {
    console.error('マイグレーションエラー:', err);
  }
};

// ========== ストレージ使用量 ==========

export const getIndexedDBUsage = async (): Promise<{ used: number; quota: number; percent: number }> => {
  if (navigator.storage && navigator.storage.estimate) {
    const estimate = await navigator.storage.estimate();
    return {
      used: estimate.usage || 0,
      quota: estimate.quota || 0,
      percent: estimate.quota ? Math.round(((estimate.usage || 0) / estimate.quota) * 100) : 0,
    };
  }
  return { used: 0, quota: 0, percent: 0 };
};

// 永続化をリクエスト
export const requestPersistentStorage = async (): Promise<boolean> => {
  if (navigator.storage && navigator.storage.persist) {
    return navigator.storage.persist();
  }
  return false;
};

// ========== 学習フィードバック操作 ==========

export const getAllLearningFeedback = async (): Promise<LearningFeedback[]> => {
  const db = await getDB();
  const items = await db.getAllFromIndex('learningFeedback', 'by-timestamp');
  return items.reverse();  // 新しい順
};

export const getLearningFeedbackById = async (id: string): Promise<LearningFeedback | undefined> => {
  const db = await getDB();
  return db.get('learningFeedback', id);
};

export const saveLearningFeedback = async (feedback: LearningFeedback): Promise<void> => {
  const db = await getDB();
  await db.put('learningFeedback', feedback);
};

export const deleteLearningFeedback = async (id: string): Promise<void> => {
  const db = await getDB();
  await db.delete('learningFeedback', id);
};

export const clearAllLearningFeedback = async (): Promise<void> => {
  const db = await getDB();
  await db.clear('learningFeedback');
};

export const getLearningFeedbackCount = async (): Promise<number> => {
  const db = await getDB();
  return db.count('learningFeedback');
};

// 特定タイプのフィードバックを取得
export const getLearningFeedbackByType = async (type: 'correction' | 'insight' | 'rule'): Promise<LearningFeedback[]> => {
  const db = await getDB();
  return db.getAllFromIndex('learningFeedback', 'by-type', type);
};

// 解析時に使用するフィードバック一覧を取得（最新N件）
export const getRecentLearningFeedback = async (limit: number = 10): Promise<LearningFeedback[]> => {
  const all = await getAllLearningFeedback();
  return all.slice(0, limit);
};
