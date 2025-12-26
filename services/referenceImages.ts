// 車両登録サービス - IndexedDB版
import { compressImage } from './imageUtils';
import * as idb from './indexedDBService';

export interface RegisteredVehicle {
  id: string;
  name: string;           // 車両名（自由入力）
  maxCapacity: number;    // 最大積載量（トン）
  base64: string;         // 画像/PDF
  mimeType?: string;      // MIMEタイプ（image/jpeg, application/pdf等）
}

// 全登録車両を取得
export const getReferenceImages = async (): Promise<RegisteredVehicle[]> => {
  return idb.getAllVehicles();
};

// 同期版（後方互換用、キャッシュから取得）
let vehicleCache: RegisteredVehicle[] | null = null;

export const getReferenceImagesSync = (): RegisteredVehicle[] => {
  return vehicleCache || [];
};

// キャッシュを更新
export const refreshVehicleCache = async (): Promise<RegisteredVehicle[]> => {
  vehicleCache = await idb.getAllVehicles();
  return vehicleCache;
};

// 車両を追加（画像は自動圧縮）
export const addVehicle = async (vehicle: Omit<RegisteredVehicle, 'id'>): Promise<RegisteredVehicle | null> => {
  try {
    let base64 = vehicle.base64;
    let mimeType = vehicle.mimeType;

    // 画像の場合は圧縮（PDFは除外）
    if (base64 && mimeType !== 'application/pdf' && base64.length > 50000) {
      base64 = await compressImage(base64, 800, 0.6);
      mimeType = 'image/jpeg';
    }

    const newVehicle: RegisteredVehicle = {
      ...vehicle,
      base64,
      mimeType,
      id: crypto.randomUUID()
    };

    await idb.saveVehicle(newVehicle);
    vehicleCache = null;
    return newVehicle;
  } catch (e) {
    console.error('車両登録エラー:', e);
    return null;
  }
};

// 車両を更新
export const updateVehicle = async (id: string, updates: Partial<Omit<RegisteredVehicle, 'id'>>): Promise<void> => {
  const vehicle = await idb.getVehicleById(id);
  if (vehicle) {
    await idb.saveVehicle({ ...vehicle, ...updates });
    vehicleCache = null;
  }
};

// 車両を削除
export const deleteVehicle = async (id: string): Promise<void> => {
  await idb.deleteVehicleById(id);
  vehicleCache = null;
};

// 既存の車両データを圧縮（マイグレーション済みのため空実装）
export const compressExistingVehicles = async (): Promise<void> => {
  // IndexedDBマイグレーションで処理するため空実装
};
