import React, { useState, useCallback } from 'react';
import { StockItem } from '../types';
import { readImageFile } from '../utils/imageUtils';
import { createStockItem } from '../domain/stockItem';

// Re-export moved helpers for backward compatibility
export { readImageFile } from '../utils/imageUtils';
export { createStockItem, buildStockUpdate } from '../domain/stockItem';
export { loadExportConfig, saveExportConfig } from '../services/exportConfigService';
export type { ExportConfig } from '../services/exportConfigService';

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
