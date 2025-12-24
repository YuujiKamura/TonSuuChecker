// 車両登録サービス - 複数の車両を登録・管理

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
export const addVehicle = (vehicle: Omit<RegisteredVehicle, 'id'>): RegisteredVehicle => {
  const vehicles = getReferenceImages();
  const newVehicle: RegisteredVehicle = {
    ...vehicle,
    id: crypto.randomUUID()
  };
  vehicles.push(newVehicle);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(vehicles));
  return newVehicle;
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
