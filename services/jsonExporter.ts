// JSON エクスポート/インポート サービス
// 全データをBase64画像含めて単一JSONとして入出力

import * as idb from './indexedDBService';
import { StockItem } from '../types';
import { RegisteredVehicle } from './referenceImages';

// エクスポートデータの型定義
export interface ExportData {
  version: number;
  exportedAt: string;
  appName: string;
  includesImages: boolean;
  stock: StockItem[];
  vehicles: RegisteredVehicle[];
  // オプション: チャット履歴とコスト履歴
  chatHistory?: Record<string, Array<{ role: string; content: string }>>;
  costHistory?: Array<{
    id: string;
    timestamp: number;
    model: string;
    callCount: number;
    estimatedCost: number;
    imageCount: number;
  }>;
}

// エクスポートオプション
export interface ExportOptions {
  includeImages: boolean;
  includeChatHistory: boolean;
  includeCostHistory: boolean;
  selectedStockIds?: string[]; // 指定した案件のみエクスポート
}

// デフォルトオプション
const defaultExportOptions: ExportOptions = {
  includeImages: true,
  includeChatHistory: false,
  includeCostHistory: false,
};

/**
 * 全データをエクスポート
 */
export const exportAllData = async (options: Partial<ExportOptions> = {}): Promise<ExportData> => {
  const opts = { ...defaultExportOptions, ...options };

  // データ取得
  let stock = await idb.getAllStock();
  const vehicles = await idb.getAllVehicles();

  // 選択した案件のみの場合
  if (opts.selectedStockIds && opts.selectedStockIds.length > 0) {
    stock = stock.filter(item => opts.selectedStockIds!.includes(item.id));
  }

  // 画像を除外する場合
  if (!opts.includeImages) {
    stock = stock.map(item => ({
      ...item,
      base64Images: [],
      imageUrls: [],
    }));
  }

  const exportData: ExportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    appName: 'TonSuuChecker',
    includesImages: opts.includeImages,
    stock,
    vehicles: opts.includeImages ? vehicles : vehicles.map(v => ({ ...v, base64: '' })),
  };

  // チャット履歴
  if (opts.includeChatHistory) {
    exportData.chatHistory = await idb.getAllChatHistories();
  }

  // コスト履歴
  if (opts.includeCostHistory) {
    exportData.costHistory = await idb.getAllCostHistory();
  }

  return exportData;
};

/**
 * JSONをファイルとしてダウンロード
 */
export const downloadAsJson = (data: ExportData, filename?: string): void => {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const date = new Date().toISOString().split('T')[0];
  const defaultFilename = `tonchecker-backup-${date}.json`;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename || defaultFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/**
 * エクスポートサイズを事前計算（MB単位）
 */
export const estimateExportSize = async (options: Partial<ExportOptions> = {}): Promise<number> => {
  const data = await exportAllData(options);
  const json = JSON.stringify(data);
  return json.length / (1024 * 1024); // MB
};

// インポート結果
export interface ImportResult {
  success: boolean;
  stockImported: number;
  vehiclesImported: number;
  chatHistoryImported: number;
  costHistoryImported: number;
  errors: string[];
}

// インポートオプション
export interface ImportOptions {
  mergeStrategy: 'replace' | 'merge' | 'skip';
  // replace: 既存データを上書き
  // merge: IDが重複する場合は新しい方を優先
  // skip: IDが重複する場合はスキップ
}

/**
 * JSONファイルからインポート
 */
export const importFromJson = async (
  file: File,
  options: ImportOptions = { mergeStrategy: 'merge' }
): Promise<ImportResult> => {
  const result: ImportResult = {
    success: false,
    stockImported: 0,
    vehiclesImported: 0,
    chatHistoryImported: 0,
    costHistoryImported: 0,
    errors: [],
  };

  try {
    const text = await file.text();
    const data: ExportData = JSON.parse(text);

    // バージョンチェック
    if (!data.version || !data.appName) {
      result.errors.push('無効なバックアップファイルです');
      return result;
    }

    if (data.appName !== 'TonSuuChecker') {
      result.errors.push('このアプリのバックアップファイルではありません');
      return result;
    }

    // 既存データ取得（マージ戦略用）
    const existingStock = options.mergeStrategy !== 'replace' ? await idb.getAllStock() : [];
    const existingVehicles = options.mergeStrategy !== 'replace' ? await idb.getAllVehicles() : [];
    const existingStockIds = new Set(existingStock.map(s => s.id));
    const existingVehicleIds = new Set(existingVehicles.map(v => v.id));

    // ストックデータのインポート
    if (data.stock && Array.isArray(data.stock)) {
      for (const item of data.stock) {
        const exists = existingStockIds.has(item.id);

        if (options.mergeStrategy === 'skip' && exists) {
          continue;
        }

        // imageUrlsがなければ生成
        if (item.base64Images && item.base64Images.length > 0 && (!item.imageUrls || item.imageUrls.length === 0)) {
          item.imageUrls = item.base64Images.map(b64 => `data:image/jpeg;base64,${b64}`);
        }

        await idb.saveStock(item);
        result.stockImported++;
      }
    }

    // 車両データのインポート
    if (data.vehicles && Array.isArray(data.vehicles)) {
      for (const vehicle of data.vehicles) {
        const exists = existingVehicleIds.has(vehicle.id);

        if (options.mergeStrategy === 'skip' && exists) {
          continue;
        }

        await idb.saveVehicle(vehicle);
        result.vehiclesImported++;
      }
    }

    // チャット履歴のインポート
    if (data.chatHistory) {
      for (const [analysisId, messages] of Object.entries(data.chatHistory)) {
        await idb.saveChatHistory(analysisId, messages);
        result.chatHistoryImported++;
      }
    }

    // コスト履歴のインポート
    if (data.costHistory && Array.isArray(data.costHistory)) {
      for (const entry of data.costHistory) {
        await idb.saveCostEntry(entry);
        result.costHistoryImported++;
      }
    }

    result.success = true;
  } catch (err) {
    result.errors.push(`パースエラー: ${err instanceof Error ? err.message : '不明なエラー'}`);
  }

  return result;
};

/**
 * ファイルを読み込んでインポート前に内容をプレビュー
 */
export const previewImportFile = async (file: File): Promise<{
  valid: boolean;
  version?: number;
  exportedAt?: string;
  stockCount?: number;
  vehiclesCount?: number;
  hasImages?: boolean;
  estimatedSizeMB?: number;
  error?: string;
}> => {
  try {
    const text = await file.text();
    const data: ExportData = JSON.parse(text);

    if (!data.version || !data.appName || data.appName !== 'TonSuuChecker') {
      return { valid: false, error: '無効なバックアップファイルです' };
    }

    return {
      valid: true,
      version: data.version,
      exportedAt: data.exportedAt,
      stockCount: data.stock?.length || 0,
      vehiclesCount: data.vehicles?.length || 0,
      hasImages: data.includesImages,
      estimatedSizeMB: text.length / (1024 * 1024),
    };
  } catch {
    return { valid: false, error: 'ファイルの読み込みに失敗しました' };
  }
};
