import React, { useState, useEffect } from 'react';
import { StockItem } from '../../types';
import { X } from 'lucide-react';
import ImagePicker from './ImagePicker';

interface EntryEditFormProps {
  item: StockItem | null;
  isOpen: boolean;
  isNew?: boolean;  // 新規作成モードかどうか
  onSave: (id: string, updates: Partial<StockItem>) => void;
  onCreate?: (item: StockItem) => void;  // 新規作成時のコールバック
  onClose: () => void;
  onAnalyze?: (item: StockItem) => void;
  onViewResult?: (item: StockItem) => void;
}

// 廃棄物の種類の選択肢
const WASTE_TYPE_OPTIONS = [
  'アスファルト殻',
  'コンクリート無筋',
  'コンクリート有筋',
];

const EntryEditForm: React.FC<EntryEditFormProps> = ({
  item,
  isOpen,
  isNew = false,
  onSave,
  onCreate,
  onClose,
  onAnalyze,
  onViewResult
}) => {
  const [actualTonnage, setActualTonnage] = useState('');
  const [maxCapacity, setMaxCapacity] = useState('');
  const [memo, setMemo] = useState('');
  const [manifestNumber, setManifestNumber] = useState('');
  const [wasteType, setWasteType] = useState('');
  const [isCustomWasteType, setIsCustomWasteType] = useState(false);
  const [destination, setDestination] = useState('');
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  // アイテムが変更されたらフォームをリセット
  useEffect(() => {
    if (item && isOpen) {
      setActualTonnage(item.actualTonnage?.toString() || '');
      setMaxCapacity(item.maxCapacity?.toString() || '');
      setMemo(item.memo || '');
      setManifestNumber(item.manifestNumber || '');
      const savedWasteType = item.wasteType || '';
      setWasteType(savedWasteType);
      // 既存の値が選択肢にない場合は自由入力モード
      setIsCustomWasteType(savedWasteType !== '' && !WASTE_TYPE_OPTIONS.includes(savedWasteType));
      setDestination(item.destination || '');
      setImageBase64(item.base64Images[0] || null);
      setImageUrl(item.imageUrls[0] || null);
    }
  }, [item?.id, isOpen]);

  const handleImageSelect = (base64: string, dataUrl: string) => {
    setImageBase64(base64);
    setImageUrl(dataUrl);
  };

  const handleSave = () => {
    if (!item) return;
    const updates: Partial<StockItem> = {
      actualTonnage: actualTonnage ? parseFloat(actualTonnage) : undefined,
      maxCapacity: maxCapacity ? parseFloat(maxCapacity) : undefined,
      memo: memo || undefined,
      manifestNumber: manifestNumber.replace(/\D/g, '') || undefined,
      wasteType: wasteType || undefined
    };
    if (imageBase64 && imageUrl) {
      updates.base64Images = [imageBase64];
      updates.imageUrls = [imageUrl];
    }

    if (isNew && onCreate) {
      // 新規作成モード: マージしたアイテムを作成して保存
      const newItem: StockItem = { ...item, ...updates };
      onCreate(newItem);
    } else {
      // 編集モード: 既存アイテムを更新
      onSave(item.id, updates);
    }
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
              <div className="w-full h-32 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center">
                <ImagePicker onImageSelect={handleImageSelect} />
              </div>
            )}
            {imageUrl && (
              <div className="absolute bottom-2 right-2">
                <ImagePicker onImageSelect={handleImageSelect} compact />
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

          {/* 廃棄物の種類 */}
          <div>
            <label className="block text-[10px] text-orange-400 font-bold mb-1 uppercase">廃棄物の種類</label>
            {isCustomWasteType ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={wasteType}
                  onChange={(e) => setWasteType(e.target.value)}
                  placeholder="種類を入力"
                  className="flex-1 bg-slate-800 border border-orange-500/30 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                />
                <button
                  type="button"
                  onClick={() => { setIsCustomWasteType(false); setWasteType(''); }}
                  className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs rounded-lg transition-all"
                >
                  選択
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <select
                  value={wasteType}
                  onChange={(e) => setWasteType(e.target.value)}
                  className="flex-1 bg-slate-800 border border-orange-500/30 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                >
                  <option value="">選択してください</option>
                  {WASTE_TYPE_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => { setIsCustomWasteType(true); setWasteType(''); }}
                  className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs rounded-lg transition-all whitespace-nowrap"
                >
                  その他
                </button>
              </div>
            )}
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
