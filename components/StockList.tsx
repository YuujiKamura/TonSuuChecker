import React from 'react';
import { StockItem } from '../types';
import { ArrowLeft, FileSpreadsheet, Plus } from 'lucide-react';
import { countExportableEntries } from '../services/excelExporter';
import { useStockList } from '../hooks/useStockList';
import StockItemRow from './StockItemRow';
import StockAddModal from './StockAddModal';
import ExportConfigModal from './shared/ExportConfigModal';

interface StockListProps {
  items: StockItem[];
  onAdd: (item: StockItem) => void;
  onUpdate: (id: string, updates: Partial<StockItem>) => void;
  onDelete: (id: string) => void;
  onAnalyze: (item: StockItem) => void;
  onViewResult: (item: StockItem) => void;
  onClose: () => void;
}

const StockList: React.FC<StockListProps> = ({ items, onAdd, onUpdate, onDelete, onAnalyze, onViewResult, onClose }) => {
  const {
    analyzedItems, unanalyzedItems,
    editingId, editTonnage, setEditTonnage, editMaxCapacity, setEditMaxCapacity,
    editMemo, setEditMemo, editManifestNumber, setEditManifestNumber,
    editImageUrl,
    startEdit, saveEdit, cancelEdit, handleEditImageSelect,
    extractingId, showFeatures, handleExtractFeatures, toggleFeatures,
    showExportModal, setShowExportModal,
    showAddForm, setShowAddForm,
    newTonnage, setNewTonnage, newMaxCapacity, setNewMaxCapacity,
    newMemo, setNewMemo, newManifestNumber, setNewManifestNumber,
    newImageUrl,
    handleNewImageSelect, handleAddEntry, resetAddForm
  } = useStockList({ items, onAdd, onUpdate });

  const renderItem = (item: StockItem) => (
    <StockItemRow
      key={item.id}
      item={item}
      isEditing={editingId === item.id}
      editTonnage={editTonnage}
      setEditTonnage={setEditTonnage}
      editMaxCapacity={editMaxCapacity}
      setEditMaxCapacity={setEditMaxCapacity}
      editMemo={editMemo}
      setEditMemo={setEditMemo}
      editManifestNumber={editManifestNumber}
      setEditManifestNumber={setEditManifestNumber}
      editImageUrl={editImageUrl}
      extractingId={extractingId}
      showFeatures={showFeatures}
      onStartEdit={() => startEdit(item)}
      onSaveEdit={() => saveEdit(item.id)}
      onCancelEdit={cancelEdit}
      onEditImageSelect={handleEditImageSelect}
      onExtractFeatures={() => handleExtractFeatures(item)}
      onToggleFeatures={() => toggleFeatures(item.id)}
      onAnalyze={() => onAnalyze(item)}
      onViewResult={() => onViewResult(item)}
      onDelete={() => onDelete(item.id)}
    />
  );

  return (
    <div className="fixed inset-0 bg-slate-950 z-[110] flex flex-col">
      {/* ヘッダー */}
      <div className="bg-slate-900 border-b border-slate-800 p-4 flex items-center gap-2 sm:gap-4">
        <button
          onClick={onClose}
          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all shrink-0"
        >
          <ArrowLeft size={20} />
        </button>
        <div onClick={onClose} className="cursor-pointer flex-grow min-w-0">
          <h2 className="text-lg font-black text-white">ストック一覧</h2>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl transition-all shrink-0"
        >
          <Plus size={18} />
          <span className="hidden sm:inline">追加</span>
        </button>
        <button
          onClick={() => setShowExportModal(true)}
          className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-xl transition-all shrink-0"
        >
          <FileSpreadsheet size={18} />
          <span className="hidden sm:inline">Excel</span>
          <span className="bg-emerald-800 px-2 py-0.5 rounded-full text-xs">
            {countExportableEntries(items)}
          </span>
        </button>
      </div>

      {/* コンテンツ */}
      <div className="flex-grow overflow-y-auto p-4 space-y-6">
        {items.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <p className="text-lg mb-2">ストックがありません</p>
            <p className="text-sm">撮影後に「ストック」を選ぶと<br/>ここに保存されます</p>
          </div>
        ) : (
          <>
            {analyzedItems.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-cyan-400 mb-3">
                  📊 解析済み（{analyzedItems.length}件）
                </h3>
                <div className="space-y-3">
                  {analyzedItems.map(item => renderItem(item))}
                </div>
              </div>
            )}

            {unanalyzedItems.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-slate-400 mb-3">
                  📷 未解析（{unanalyzedItems.length}件）
                </h3>
                <div className="space-y-3">
                  {unanalyzedItems.map(item => renderItem(item))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 新規追加モーダル */}
      <StockAddModal
        isOpen={showAddForm}
        newTonnage={newTonnage}
        setNewTonnage={setNewTonnage}
        newMaxCapacity={newMaxCapacity}
        setNewMaxCapacity={setNewMaxCapacity}
        newMemo={newMemo}
        setNewMemo={setNewMemo}
        newManifestNumber={newManifestNumber}
        setNewManifestNumber={setNewManifestNumber}
        newImageUrl={newImageUrl}
        onImageSelect={handleNewImageSelect}
        onAdd={handleAddEntry}
        onCancel={resetAddForm}
      />

      {/* Excel出力モーダル */}
      <ExportConfigModal
        items={items}
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
      />
    </div>
  );
};

export default StockList;
