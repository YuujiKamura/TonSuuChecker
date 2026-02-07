import React, { useState, useCallback } from 'react';
import { StockItem } from '../types';
import { extractFeatures } from '../services/geminiService';
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
    actualTonnage: params.tonnage ? parseFloat(params.tonnage) : undefined,
    maxCapacity: params.maxCapacity ? parseFloat(params.maxCapacity) : undefined,
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
    actualTonnage: params.tonnage ? parseFloat(params.tonnage) : undefined,
    maxCapacity: params.maxCapacity ? parseFloat(params.maxCapacity) : undefined,
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
  onUpdate: (id: string, updates: Partial<StockItem>) => void;
}

export function useStockList({ items, onAdd, onUpdate }: UseStockListParams) {
  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTonnage, setEditTonnage] = useState('');
  const [editMaxCapacity, setEditMaxCapacity] = useState('');
  const [editMemo, setEditMemo] = useState('');
  const [editManifestNumber, setEditManifestNumber] = useState('');
  const [editImageBase64, setEditImageBase64] = useState<string | null>(null);
  const [editImageUrl, setEditImageUrl] = useState<string | null>(null);
  const [editPhotoTakenAt, setEditPhotoTakenAt] = useState<number | undefined>(undefined);

  // Feature extraction state
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const [showFeatures, setShowFeatures] = useState<string | null>(null);

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

  // Edit actions
  const startEdit = useCallback((item: StockItem) => {
    setEditingId(item.id);
    setEditTonnage(item.actualTonnage?.toString() || '');
    setEditMaxCapacity(item.maxCapacity?.toString() || '');
    setEditMemo(item.memo || '');
    setEditManifestNumber(item.manifestNumber || '');
    setEditImageBase64(item.base64Images[0] || null);
    setEditImageUrl(item.imageUrls[0] || null);
    setEditPhotoTakenAt(item.photoTakenAt);
  }, []);

  const saveEdit = useCallback((id: string) => {
    const updates = buildStockUpdate({
      tonnage: editTonnage, maxCapacity: editMaxCapacity,
      memo: editMemo, manifestNumber: editManifestNumber,
      imageBase64: editImageBase64, imageUrl: editImageUrl,
      photoTakenAt: editPhotoTakenAt
    });
    onUpdate(id, updates);
    setEditingId(null);
  }, [editTonnage, editMaxCapacity, editMemo, editManifestNumber, editImageBase64, editImageUrl, editPhotoTakenAt, onUpdate]);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditTonnage(''); setEditMaxCapacity('');
    setEditMemo(''); setEditManifestNumber('');
    setEditImageBase64(null); setEditImageUrl(null);
    setEditPhotoTakenAt(undefined);
  }, []);

  const handleEditImageSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const result = await readImageFile(file);
    setEditImageBase64(result.base64);
    setEditImageUrl(result.dataUrl);
    setEditPhotoTakenAt(result.photoTakenAt);
    e.target.value = '';
  }, []);

  // Feature extraction
  const handleExtractFeatures = useCallback(async (item: StockItem) => {
    if (!item.actualTonnage || !item.base64Images[0]) return;
    setExtractingId(item.id);
    try {
      const { features, rawResponse } = await extractFeatures(
        item.base64Images[0], item.actualTonnage, undefined, item.maxCapacity, item.memo
      );
      onUpdate(item.id, { extractedFeatures: features, featureRawResponse: rawResponse });
    } catch (err) {
      console.error('特徴抽出エラー:', err);
    } finally {
      setExtractingId(null);
    }
  }, [onUpdate]);

  const toggleFeatures = useCallback((itemId: string) => {
    setShowFeatures(prev => prev === itemId ? null : itemId);
  }, []);

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
    editingId, editTonnage, setEditTonnage, editMaxCapacity, setEditMaxCapacity,
    editMemo, setEditMemo, editManifestNumber, setEditManifestNumber,
    editImageBase64, editImageUrl, editPhotoTakenAt,
    startEdit, saveEdit, cancelEdit, handleEditImageSelect,
    extractingId, showFeatures, handleExtractFeatures, toggleFeatures,
    showExportModal, setShowExportModal,
    showAddForm, setShowAddForm,
    newTonnage, setNewTonnage, newMaxCapacity, setNewMaxCapacity,
    newMemo, setNewMemo, newManifestNumber, setNewManifestNumber,
    newImageBase64, newImageUrl, newPhotoTakenAt,
    handleNewImageSelect, handleAddEntry, resetAddForm
  };
}
