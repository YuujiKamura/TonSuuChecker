// 車両登録サービス - 複数の車両を登録・管理
import { compressImage } from './imageUtils';

export interface RegisteredVehicle {
  id: string;
  name: string;           // 車両名（自由入力）
  maxCapacity: number;    // 最大積載量（トン）
  base64: string;         // 画像/PDF
  mimeType?: string;      // MIMEタイプ（image/jpeg, application/pdf等）
}

const STORAGE_KEY = 'tonchecker_registered_vehicles';

// 全登録車両を取得
export const getReferenceImages = (): RegisteredVehicle[] => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return [];
  try {
    return JSON.parse(stored) as RegisteredVehicle[];
  } catch {
    return [];
  }
};

// 車両を追加
export const addVehicle = (vehicle: Omit<RegisteredVehicle, 'id'>): RegisteredVehicle | null => {
  const vehicles = getReferenceImages();
  const newVehicle: RegisteredVehicle = {
    ...vehicle,
    id: crypto.randomUUID()
  };
  vehicles.push(newVehicle);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(vehicles));
    return newVehicle;
  } catch (e) {
    console.error('車両登録エラー（容量オーバーの可能性）:', e);
    return null;
  }
};

// 車両を更新
export const updateVehicle = (id: string, updates: Partial<Omit<RegisteredVehicle, 'id'>>): void => {
  const vehicles = getReferenceImages();
  const index = vehicles.findIndex(v => v.id === id);
  if (index >= 0) {
    vehicles[index] = { ...vehicles[index], ...updates };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(vehicles));
  }
};

// 車両を削除
export const deleteVehicle = (id: string): void => {
  const vehicles = getReferenceImages().filter(v => v.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(vehicles));
};

// 既存の車両データを圧縮（初回のみ実行）
export const compressExistingVehicles = async (): Promise<void> => {
  const COMPRESSED_FLAG = 'tonchecker_vehicles_compressed_v1';
  if (localStorage.getItem(COMPRESSED_FLAG)) return;

  try {
    const vehicles = getReferenceImages();
    if (vehicles.length === 0) {
      localStorage.setItem(COMPRESSED_FLAG, 'true');
      return;
    }

    console.log(`既存車両 ${vehicles.length}件 を圧縮中...`);
    const compressedVehicles: RegisteredVehicle[] = [];

    for (const vehicle of vehicles) {
      if (vehicle.base64 && vehicle.base64.length > 50000 && vehicle.mimeType !== 'application/pdf') {
        const compressed = await compressImage(vehicle.base64, 800, 0.6);
        compressedVehicles.push({
          ...vehicle,
          base64: compressed,
          mimeType: 'image/jpeg'
        });
      } else {
        compressedVehicles.push(vehicle);
      }
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(compressedVehicles));
    localStorage.setItem(COMPRESSED_FLAG, 'true');
    console.log('車両圧縮完了');
  } catch (err) {
    console.error('車両圧縮エラー:', err);
  }
};
