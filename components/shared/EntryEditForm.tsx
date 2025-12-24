import React, { useState, useEffect, useRef } from 'react';
import { StockItem } from '../../types';
import { Camera, FolderOpen, X } from 'lucide-react';

interface EntryEditFormProps {
  item: StockItem | null;
  isOpen: boolean;
  onSave: (id: string, updates: Partial<StockItem>) => void;
  onClose: () => void;
  onAnalyze?: (item: StockItem) => void;
  onViewResult?: (item: StockItem) => void;
}

const EntryEditForm: React.FC<EntryEditFormProps> = ({
  item,
  isOpen,
  onSave,
  onClose,
  onAnalyze,
  onViewResult
}) => {
  const [actualTonnage, setActualTonnage] = useState('');
  const [maxCapacity, setMaxCapacity] = useState('');
  const [memo, setMemo] = useState('');
  const [manifestNumber, setManifestNumber] = useState('');
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  // アイテムが変更されたらフォームをリセット
  useEffect(() => {
    if (item && isOpen) {
      setActualTonnage(item.actualTonnage?.toString() || '');
      setMaxCapacity(item.maxCapacity?.toString() || '');
      setMemo(item.memo || '');
      setManifestNumber(item.manifestNumber || '');
      setImageBase64(item.base64Images[0] || null);
      setImageUrl(item.imageUrls[0] || null);
    }
  }, [item, isOpen]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      setImageBase64(base64);
      setImageUrl(dataUrl);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSave = () => {
    if (!item) return;
    const updates: Partial<StockItem> = {
      actualTonnage: actualTonnage ? parseFloat(actualTonnage) : undefined,
      maxCapacity: maxCapacity ? parseFloat(maxCapacity) : undefined,
      memo: memo || undefined,
      manifestNumber: manifestNumber.replace(/\D/g, '') || undefined
    };
    if (imageBase64 && imageUrl) {
      updates.base64Images = [imageBase64];
      updates.imageUrls = [imageUrl];
    }
    onSave(item.id, updates);
    onClose();
  };

  if (!isOpen || !item) return null;

  const hasAnalysis = (item.estimations && item.estimations.length > 0) || item.result;

  return (
    <div className="fixed inset-0 bg-black/80 z-[120] flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* ヘッダー */}
        <div className="sticky top-0 bg-slate-900 border-b border-slate-800 p-3 flex items-center justify-between z-10">
          <h3 className="text-sm font-bold text-white">エントリー編集</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-all">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* 画像 */}
          <div className="relative">
            {imageUrl ? (
              <img
                src={imageUrl}
                className="w-full max-h-[40vh] rounded-xl object-contain bg-slate-800 border border-slate-700"
                alt="Stock"
              />
            ) : (
              <div className="w-full h-32 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center gap-6">
                <label className="flex flex-col items-center gap-2 p-4 rounded-xl cursor-pointer hover:bg-slate-700 transition-colors">
                  <Camera size={24} className="text-blue-400" />
                  <span className="text-[10px] text-slate-400">カメラ</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleImageSelect}
                    className="hidden"
                  />
                </label>
                <label className="flex flex-col items-center gap-2 p-4 rounded-xl cursor-pointer hover:bg-slate-700 transition-colors">
                  <FolderOpen size={24} className="text-yellow-400" />
                  <span className="text-[10px] text-slate-400">ギャラリー</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageSelect}
                    className="hidden"
                  />
                </label>
              </div>
            )}
            {imageUrl && (
              <div className="absolute bottom-2 right-2 flex gap-1.5">
                <label className="flex items-center gap-1 px-2 py-1 bg-slate-900/90 hover:bg-slate-800 text-white text-[10px] font-bold rounded-lg cursor-pointer border border-slate-600">
                  <Camera size={12} />
                  <input type="file" accept="image/*" capture="environment" onChange={handleImageSelect} className="hidden" />
                </label>
                <label className="flex items-center gap-1 px-2 py-1 bg-slate-900/90 hover:bg-slate-800 text-white text-[10px] font-bold rounded-lg cursor-pointer border border-slate-600">
                  <FolderOpen size={12} />
                  <input type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
                </label>
              </div>
            )}
          </div>

          {/* 日時 */}
          <p className="text-[10px] text-slate-500">
            {new Date(item.timestamp).toLocaleString()}
          </p>

          {/* マニフェスト番号 */}
          <div>
            <label className="block text-[10px] text-amber-400 font-bold mb-1 uppercase">マニフェスト伝票番号</label>
            <input
              type="text"
              inputMode="numeric"
              value={manifestNumber}
              onChange={(e) => setManifestNumber(e.target.value.replace(/\D/g, ''))}
              placeholder="数字のみ"
              className="w-full bg-slate-800 border border-amber-500/30 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500 font-mono"
            />
          </div>

          {/* 実測値・最大積載量 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] text-green-400 font-bold mb-1 uppercase">実測トン数</label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={actualTonnage}
                  onChange={(e) => setActualTonnage(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-slate-800 border border-green-500/30 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                />
                <span className="text-slate-500 text-xs">t</span>
              </div>
            </div>
            <div>
              <label className="block text-[10px] text-purple-400 font-bold mb-1 uppercase">最大積載量</label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={maxCapacity}
                  onChange={(e) => setMaxCapacity(e.target.value)}
                  placeholder="0.0"
                  className="w-full bg-slate-800 border border-purple-500/30 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                />
                <span className="text-slate-500 text-xs">t</span>
              </div>
            </div>
          </div>

          {/* メモ */}
          <div>
            <label className="block text-[10px] text-slate-400 font-bold mb-1 uppercase">備考</label>
            <input
              type="text"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="車番、会社名など"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* AI解析タグ表示 */}
          {hasAnalysis && (
            <div className="flex items-center gap-2 flex-wrap">
              {(() => {
                const latest = item.estimations?.[0] || item.result;
                return latest?.estimatedTonnage && (
                  <span className="text-[10px] font-bold text-cyan-400 bg-cyan-500/20 px-2 py-0.5 rounded-full">
                    AI推定: {latest.estimatedTonnage.toFixed(1)}t
                  </span>
                );
              })()}
            </div>
          )}

          {/* アクションボタン */}
          <div className="flex gap-2 pt-2">
            {imageUrl && onAnalyze && (
              <button
                onClick={() => { onClose(); onAnalyze(item); }}
                className="flex-1 px-3 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition-all"
              >
                AI解析
              </button>
            )}
            {hasAnalysis && onViewResult && (
              <button
                onClick={() => { onClose(); onViewResult(item); }}
                className="flex-1 px-3 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-xl transition-all"
              >
                結果を見る
              </button>
            )}
          </div>
        </div>

        {/* フッター */}
        <div className="sticky bottom-0 bg-slate-900 border-t border-slate-800 p-3 flex gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-bold rounded-xl transition-all"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-xl transition-all"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
};

export default EntryEditForm;
