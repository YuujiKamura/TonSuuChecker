import React, { useRef } from 'react';
import { Plus, Camera, FolderOpen } from 'lucide-react';

interface StockAddModalProps {
  isOpen: boolean;
  newTonnage: string;
  setNewTonnage: (v: string) => void;
  newMaxCapacity: string;
  setNewMaxCapacity: (v: string) => void;
  newMemo: string;
  setNewMemo: (v: string) => void;
  newManifestNumber: string;
  setNewManifestNumber: (v: string) => void;
  newImageUrl: string | null;
  onImageSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onAdd: () => void;
  onCancel: () => void;
}

const StockAddModal: React.FC<StockAddModalProps> = ({
  isOpen,
  newTonnage, setNewTonnage,
  newMaxCapacity, setNewMaxCapacity,
  newMemo, setNewMemo,
  newManifestNumber, setNewManifestNumber,
  newImageUrl,
  onImageSelect,
  onAdd,
  onCancel
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-2xl p-6 w-full max-w-md border border-slate-700 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-black text-white mb-4">
          新規エントリー追加
        </h3>

        <div className="space-y-4 mb-6">
          {/* 画像選択 */}
          <div>
            <span className="block text-sm text-slate-400 mb-2">画像（任意）</span>
            {newImageUrl ? (
              <div className="relative">
                <img
                  src={newImageUrl}
                  className="w-full h-40 object-contain bg-slate-900 rounded-xl border border-slate-600"
                  alt="Preview"
                />
                <div className="absolute bottom-2 right-2 flex gap-2">
                  <label
                    htmlFor="new-camera-input"
                    className="flex items-center gap-1 px-2 py-1.5 bg-slate-800/90 hover:bg-slate-700 text-white text-xs font-bold rounded-lg transition-all border border-slate-600 cursor-pointer"
                  >
                    <Camera size={14} />
                    撮影
                  </label>
                  <label
                    htmlFor="new-file-input"
                    className="flex items-center gap-1 px-2 py-1.5 bg-slate-800/90 hover:bg-slate-700 text-white text-xs font-bold rounded-lg transition-all border border-slate-600 cursor-pointer"
                  >
                    <FolderOpen size={14} />
                    選択
                  </label>
                </div>
              </div>
            ) : (
              <div className="w-full h-32 border-2 border-dashed border-slate-600 rounded-xl flex items-center justify-center gap-6">
                <label
                  htmlFor="new-camera-input"
                  className="flex flex-col items-center gap-2 p-4 rounded-xl cursor-pointer hover:bg-slate-700/50 transition-colors"
                >
                  <Camera size={28} className="text-blue-400" />
                  <span className="text-xs text-slate-400">カメラ</span>
                </label>
                <label
                  htmlFor="new-file-input"
                  className="flex flex-col items-center gap-2 p-4 rounded-xl cursor-pointer hover:bg-slate-700/50 transition-colors"
                >
                  <FolderOpen size={28} className="text-yellow-400" />
                  <span className="text-xs text-slate-400">ギャラリー</span>
                </label>
              </div>
            )}
            <input
              id="new-camera-input"
              type="file"
              onChange={onImageSelect}
              accept="image/*"
              capture="environment"
              className="hidden"
            />
            <input
              id="new-file-input"
              type="file"
              ref={fileInputRef}
              onChange={onImageSelect}
              accept="image/*"
              className="hidden"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-400 mb-1">実測トン数</label>
              <input
                type="number"
                step="0.1"
                value={newTonnage}
                onChange={(e) => setNewTonnage(e.target.value)}
                placeholder="例: 3.5"
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">最大積載量</label>
              <input
                type="number"
                step="0.1"
                value={newMaxCapacity}
                onChange={(e) => setNewMaxCapacity(e.target.value)}
                placeholder="例: 4.0"
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">メモ（車番など）</label>
            <input
              type="text"
              value={newMemo}
              onChange={(e) => setNewMemo(e.target.value)}
              placeholder="例: ○○建設 4tダンプ"
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">マニフェスト番号</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={newManifestNumber}
              onChange={(e) => setNewManifestNumber(e.target.value.replace(/\D/g, ''))}
              placeholder="数字のみ"
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-3 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-bold rounded-xl transition-all"
          >
            キャンセル
          </button>
          <button
            onClick={onAdd}
            className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2"
          >
            <Plus size={18} />
            追加
          </button>
        </div>
      </div>
    </div>
  );
};

export default StockAddModal;
