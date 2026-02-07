import { StockItem } from '../types';

// --- Safe parseFloat with NaN fallback ---
const safeParseFloat = (input: string): number | undefined => {
  if (!input) return undefined;
  const value = parseFloat(input);
  if (isNaN(value)) return undefined;
  return value;
};

// --- New entry creation helper ---
export const createStockItem = (params: {
  imageBase64: string | null;
  imageUrl: string | null;
  photoTakenAt?: number;
  tonnage: string;
  maxCapacity: string;
  memo: string;
  manifestNumber: string;
}): StockItem => {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    photoTakenAt: params.photoTakenAt,
    base64Images: params.imageBase64 ? [params.imageBase64] : [],
    imageUrls: params.imageUrl ? [params.imageUrl] : [],
    actualTonnage: safeParseFloat(params.tonnage),
    maxCapacity: safeParseFloat(params.maxCapacity),
    memo: params.memo || undefined,
    manifestNumber: params.manifestNumber.replace(/\D/g, '') || undefined
  };
};

// --- Build update object for editing ---
export const buildStockUpdate = (params: {
  tonnage: string;
  maxCapacity: string;
  memo: string;
  manifestNumber: string;
  imageBase64: string | null;
  imageUrl: string | null;
  photoTakenAt?: number;
}): Partial<StockItem> => {
  const updates: Partial<StockItem> = {
    actualTonnage: safeParseFloat(params.tonnage),
    maxCapacity: safeParseFloat(params.maxCapacity),
    memo: params.memo || undefined,
    manifestNumber: params.manifestNumber.replace(/\D/g, '') || undefined
  };
  if (params.imageBase64 && params.imageUrl) {
    updates.base64Images = [params.imageBase64];
    updates.imageUrls = [params.imageUrl];
    if (params.photoTakenAt !== undefined) {
      updates.photoTakenAt = params.photoTakenAt;
    }
  }
  return updates;
};
