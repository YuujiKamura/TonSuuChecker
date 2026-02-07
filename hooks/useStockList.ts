import React, { useState, useCallback } from 'react';
import { StockItem } from '../types';
import { extractPhotoTakenAt } from '../services/exifUtils';

// --- localStorage helpers ---
const EXPORT_CONFIG_CACHE_KEY = 'tonsuuChecker_exportConfig';

const defaultExportConfig = {
  wasteType: 'アスファルト殻',
  destination: '',
  unit: 'ｔ',
  projectNumber: '',
  projectName: '',
  contractorName: '',
  siteManager: ''
};

export type ExportConfig = typeof defaultExportConfig;

export const loadExportConfig = (): ExportConfig => {
  try {
    const cached = localStorage.getItem(EXPORT_CONFIG_CACHE_KEY);
    if (cached) {
      return { ...defaultExportConfig, ...JSON.parse(cached) };
    }
  } catch (e) {
    console.error('キャッシュ読み込みエラー:', e);
  }
  return { ...defaultExportConfig };
};

export const saveExportConfig = (config: ExportConfig) => {
  try {
    localStorage.setItem(EXPORT_CONFIG_CACHE_KEY, JSON.stringify(config));
  } catch (e) {
    console.error('キャッシュ保存エラー:', e);
  }
};

// --- Image file reading helper ---
export const readImageFile = (file: File): Promise<{ base64: string; dataUrl: string; photoTakenAt?: number }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = async () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      const photoTakenAt = await extractPhotoTakenAt(file);
      resolve({ base64, dataUrl, photoTakenAt });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

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

// --- Main hook ---
export interface UseStockListParams {
  items: StockItem[];
  onAdd: (item: StockItem) => void;
}

export function useStockList({ items, onAdd }: UseStockListParams) {
  // Modal state
  const [showExportModal, setShowExportModal] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  // Add form state
  const [newTonnage, setNewTonnage] = useState('');
  const [newMaxCapacity, setNewMaxCapacity] = useState('');
  const [newMemo, setNewMemo] = useState('');
  const [newManifestNumber, setNewManifestNumber] = useState('');
  const [newImageBase64, setNewImageBase64] = useState<string | null>(null);
  const [newImageUrl, setNewImageUrl] = useState<string | null>(null);
  const [newPhotoTakenAt, setNewPhotoTakenAt] = useState<number | undefined>(undefined);

  // Derived data
  const analyzedItems = items.filter(item => (item.estimations && item.estimations.length > 0) || item.result);
  const unanalyzedItems = items.filter(item => !((item.estimations && item.estimations.length > 0) || item.result));

  // Add form actions
  const handleNewImageSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const result = await readImageFile(file);
    setNewImageBase64(result.base64);
    setNewImageUrl(result.dataUrl);
    setNewPhotoTakenAt(result.photoTakenAt);
    e.target.value = '';
  }, []);

  const handleAddEntry = useCallback(() => {
    const newItem = createStockItem({
      imageBase64: newImageBase64, imageUrl: newImageUrl,
      photoTakenAt: newPhotoTakenAt, tonnage: newTonnage,
      maxCapacity: newMaxCapacity, memo: newMemo, manifestNumber: newManifestNumber
    });
    onAdd(newItem);
    setShowAddForm(false);
    setNewTonnage(''); setNewMaxCapacity('');
    setNewMemo(''); setNewManifestNumber('');
    setNewImageBase64(null); setNewImageUrl(null); setNewPhotoTakenAt(undefined);
  }, [newImageBase64, newImageUrl, newPhotoTakenAt, newTonnage, newMaxCapacity, newMemo, newManifestNumber, onAdd]);

  const resetAddForm = useCallback(() => {
    setShowAddForm(false);
    setNewTonnage(''); setNewMaxCapacity('');
    setNewMemo(''); setNewManifestNumber('');
    setNewImageBase64(null); setNewImageUrl(null); setNewPhotoTakenAt(undefined);
  }, []);

  return {
    analyzedItems, unanalyzedItems,
    showExportModal, setShowExportModal,
    showAddForm, setShowAddForm,
    newTonnage, setNewTonnage, newMaxCapacity, setNewMaxCapacity,
    newMemo, setNewMemo, newManifestNumber, setNewManifestNumber,
    newImageBase64, newImageUrl, newPhotoTakenAt,
    handleNewImageSelect, handleAddEntry, resetAddForm
  };
}
