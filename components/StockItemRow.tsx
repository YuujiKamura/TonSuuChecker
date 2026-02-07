import React, { useState, useCallback, useRef } from 'react';
import { StockItem } from '../types';
import { Trash2, Brain, Sparkles, Loader2, Eye, Camera, FolderOpen } from 'lucide-react';
import { getEffectiveDateTime, formatDateTime } from '../services/exifUtils';
import { readImageFile, buildStockUpdate } from '../hooks/useStockList';
import { extractFeatures } from '../services/geminiService';

interface StockItemRowProps {
  item: StockItem;
  onUpdate: (id: string, updates: Partial<StockItem>) => void;
  onDelete: (id: string) => void;
  onAnalyze: (item: StockItem) => void;
  onViewResult: (item: StockItem) => void;
}

const StockItemRow: React.FC<StockItemRowProps> = ({
  item, onUpdate, onDelete, onAnalyze, onViewResult
}) => {
  const editFileInputRef = useRef<HTMLInputElement>(null);

  // Edit state (internalized)
  const [isEditing, setIsEditing] = useState(false);
  const [editTonnage, setEditTonnage] = useState('');
  const [editMaxCapacity, setEditMaxCapacity] = useState('');
  const [editMemo, setEditMemo] = useState('');
  const [editManifestNumber, setEditManifestNumber] = useState('');
  const [editImageBase64, setEditImageBase64] = useState<string | null>(null);
  const [editImageUrl, setEditImageUrl] = useState<string | null>(null);
  const [editPhotoTakenAt, setEditPhotoTakenAt] = useState<number | undefined>(undefined);

  // Feature extraction state (internalized)
  const [extractingFeatures, setExtractingFeatures] = useState(false);
  const [showFeatures, setShowFeatures] = useState(false);

  const hasAnalysis = (item.estimations && item.estimations.length > 0) || item.result;

  const startEdit = useCallback(() => {
    setIsEditing(true);
    setEditTonnage(item.actualTonnage?.toString() || '');
    setEditMaxCapacity(item.maxCapacity?.toString() || '');
    setEditMemo(item.memo || '');
    setEditManifestNumber(item.manifestNumber || '');
    setEditImageBase64(item.base64Images[0] || null);
    setEditImageUrl(item.imageUrls[0] || null);
    setEditPhotoTakenAt(item.photoTakenAt);
  }, [item]);

  const saveEdit = useCallback(() => {
    const updates = buildStockUpdate({
      tonnage: editTonnage,
      maxCapacity: editMaxCapacity,
      memo: editMemo,
      manifestNumber: editManifestNumber,
      imageBase64: editImageBase64,
      imageUrl: editImageUrl,
      photoTakenAt: editPhotoTakenAt
    });
    onUpdate(item.id, updates);
    setIsEditing(false);
  }, [editTonnage, editMaxCapacity, editMemo, editManifestNumber, editImageBase64, editImageUrl, editPhotoTakenAt, onUpdate, item.id]);

  const cancelEdit = useCallback(() => {
    setIsEditing(false);
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

  const handleExtractFeatures = useCallback(async () => {
    if (!item.actualTonnage || !item.base64Images[0]) return;
    setExtractingFeatures(true);
    try {
      const { features, rawResponse } = await extractFeatures(
        item.base64Images[0], item.actualTonnage, undefined, item.maxCapacity, item.memo
      );
      onUpdate(item.id, { extractedFeatures: features, featureRawResponse: rawResponse });
    } catch (err) {
      console.error('特徴抽出エラー:', err);
    } finally {
      setExtractingFeatures(false);
    }
  }, [item, onUpdate]);

  const toggleFeatures = useCallback(() => {
    setShowFeatures(prev => !prev);
  }, []);

  return (
      <div
        className={`bg-slate-800 border rounded-2xl p-4 ${
          hasAnalysis
            ? 'border-cyan-500/30 bg-slate-800/80'
            : 'border-slate-700'
        } ${isEditing ? 'border-blue-500/50' : ''}`}
      >
        {/* 編集モード：大きい画像とフォーム */}
        {isEditing ? (
          <div className="space-y-4">
            {/* 画像表示・変更 */}
            <div className="relative">
              {editImageUrl ? (
                <img
                  src={editImageUrl}
                  className="w-full max-h-[50vh] rounded-xl object-contain bg-slate-900 border border-slate-600"
                  alt="Stock"
                />
              ) : (
                <div className="w-full h-40 rounded-xl bg-slate-900 border border-slate-600 flex items-center justify-center gap-4">
                  <label
                    htmlFor={`edit-camera-${item.id}`}
                    className="flex flex-col items-center gap-2 p-4 rounded-xl cursor-pointer hover:bg-slate-800 transition-colors"
                  >
                    <Camera size={28} className="text-blue-400" />
                    <span className="text-xs text-slate-400">カメラ</span>
                  </label>
                  <label
                    htmlFor={`edit-file-${item.id}`}
                    className="flex flex-col items-center gap-2 p-4 rounded-xl cursor-pointer hover:bg-slate-800 transition-colors"
                  >
                    <FolderOpen size={28} className="text-yellow-400" />
                    <span className="text-xs text-slate-400">ギャラリー</span>
                  </label>
                </div>
              )}
              {editImageUrl && (
                <div className="absolute bottom-2 right-2 flex gap-2">
                  <label
                    htmlFor={`edit-camera-${item.id}`}
                    className="flex items-center gap-1 px-2 py-1.5 bg-slate-800/90 hover:bg-slate-700 text-white text-xs font-bold rounded-lg transition-all border border-slate-600 cursor-pointer"
                  >
                    <Camera size={14} />
                    撮影
                  </label>
                  <label
                    htmlFor={`edit-file-${item.id}`}
                    className="flex items-center gap-1 px-2 py-1.5 bg-slate-800/90 hover:bg-slate-700 text-white text-xs font-bold rounded-lg transition-all border border-slate-600 cursor-pointer"
                  >
                    <FolderOpen size={14} />
                    選択
                  </label>
                </div>
              )}
              <input
                id={`edit-camera-${item.id}`}
                type="file"
                onChange={handleEditImageSelect}
                accept="image/*"
                capture="environment"
                className="hidden"
              />
              <input
                id={`edit-file-${item.id}`}
                type="file"
                ref={editFileInputRef}
                onChange={handleEditImageSelect}
                accept="image/*"
                className="hidden"
              />
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-slate-500" title={item.photoTakenAt ? '撮影日時（EXIF）' : '登録日時'}>
                  {formatDateTime(getEffectiveDateTime(item))}
                  {item.photoTakenAt && <span className="ml-1 text-cyan-400">📷</span>}
                </span>
              </div>
              <div className="flex gap-4 flex-wrap">
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.1"
                    value={editTonnage}
                    onChange={(e) => setEditTonnage(e.target.value)}
                    placeholder="実測トン数"
                    className="w-24 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-slate-400 self-center text-sm">t</span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.1"
                    value={editMaxCapacity}
                    onChange={(e) => setEditMaxCapacity(e.target.value)}
                    placeholder="最大積載量"
                    className="w-24 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-slate-400 self-center text-sm">t積</span>
                </div>
              </div>
              <input
                type="text"
                value={editMemo}
                onChange={(e) => setEditMemo(e.target.value)}
                placeholder="メモ（車番など）"
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              />
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={editManifestNumber}
                onChange={(e) => setEditManifestNumber(e.target.value.replace(/\D/g, ''))}
                placeholder="マニフェスト伝票番号"
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
              />
              <div className="flex flex-col-reverse sm:flex-row gap-2">
                <button
                  onClick={cancelEdit}
                  className="px-4 py-3 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-bold rounded-xl transition-all"
                >
                  閉じる
                </button>
                <button
                  onClick={saveEdit}
                  className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl transition-all"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* 通常表示 */
          <div className="flex items-start gap-4">
            {item.imageUrls[0] ? (
              <img
                src={item.imageUrls[0]}
                className="w-20 h-20 rounded-xl object-cover bg-slate-900 border border-slate-600 shrink-0 cursor-pointer hover:border-blue-500 transition-all active:scale-95"
                alt="Stock"
                onClick={startEdit}
              />
            ) : (
              <div
                className="w-20 h-20 rounded-xl bg-slate-900 border border-slate-600 shrink-0 cursor-pointer hover:border-blue-500 transition-all active:scale-95 flex items-center justify-center"
                onClick={startEdit}
              >
                <Camera size={24} className="text-slate-600" />
              </div>
            )}

            <div className="flex-grow min-w-0">
              {/* 日時とタグ */}
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {(() => {
                  const latestEstimation = item.estimations && item.estimations.length > 0
                    ? item.estimations[0]
                    : item.result;
                  return latestEstimation?.estimatedTonnage && (
                    <span className="text-xs font-bold text-cyan-400 bg-cyan-500/20 px-2 py-0.5 rounded-full" title={item.estimations && item.estimations.length > 1 ? `推定履歴: ${item.estimations.length}回` : ''}>
                      推定{latestEstimation.estimatedTonnage.toFixed(1)}t{item.estimations && item.estimations.length > 1 ? ` (${item.estimations.length}回)` : ''}
                    </span>
                  );
                })()}
                {item.actualTonnage && (
                  <span className="text-xs font-bold text-blue-400 bg-blue-500/20 px-2 py-0.5 rounded-full">
                    実測{item.actualTonnage}t
                  </span>
                )}
                {item.maxCapacity && (
                  <span className="text-xs font-bold text-purple-400 bg-purple-500/20 px-2 py-0.5 rounded-full">
                    {item.maxCapacity}t積
                  </span>
                )}
                {item.manifestNumber && (
                  <span className="text-xs font-bold text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded-full">
                    {item.manifestNumber}
                  </span>
                )}
                <span className="text-xs text-slate-500" title={item.photoTakenAt ? '撮影日時（EXIF）' : '登録日時'}>
                  {formatDateTime(getEffectiveDateTime(item))}
                  {item.photoTakenAt && <span className="ml-1 text-cyan-400">📷</span>}
                </span>
              </div>

              {item.memo && (
                <p className="text-sm text-slate-400 truncate">{item.memo}</p>
              )}
            </div>

            {/* アクションボタン */}
            <div className="flex flex-col gap-2 shrink-0">
              <div className="flex gap-2 flex-wrap">
                {/* 特徴抽出ボタン（実測値がある場合） */}
                {item.actualTonnage && item.base64Images[0] && (
                  <button
                    onClick={handleExtractFeatures}
                    disabled={extractingFeatures}
                    className={`p-2 rounded-xl border transition-all active:scale-95 ${
                      item.extractedFeatures
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/20'
                    }`}
                    title={item.extractedFeatures ? '特徴抽出済み' : '特徴を抽出'}
                  >
                    {extractingFeatures ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Sparkles size={16} />
                    )}
                  </button>
                )}
                {/* 抽出結果表示トグル */}
                {item.extractedFeatures && (
                  <button
                    onClick={toggleFeatures}
                    className="p-2 rounded-xl bg-slate-700 border border-slate-600 text-slate-400 hover:bg-slate-600 transition-all active:scale-95 text-xs"
                  >
                    {showFeatures ? '閉' : '詳'}
                  </button>
                )}
                {/* 解析結果を見るボタン（解析済みの場合） */}
                {(item.estimations && item.estimations.length > 0) || item.result ? (
                  <button
                    onClick={() => onViewResult(item)}
                    className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 transition-all active:scale-95"
                    title="解析結果を見る"
                  >
                    <Eye size={16} />
                  </button>
                ) : null}
                {/* AI解析ボタン（再解析用） - 画像がある場合のみ */}
                {item.imageUrls[0] && (
                  <button
                    onClick={() => onAnalyze(item)}
                    className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 hover:bg-blue-500/20 transition-all active:scale-95"
                    title="AI解析"
                  >
                    <Brain size={16} />
                  </button>
                )}
                <button
                  onClick={() => onDelete(item.id)}
                  className="p-2 rounded-xl bg-slate-700 border border-slate-600 text-slate-400 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30 transition-all active:scale-95"
                  title="削除"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            {/* 抽出結果表示 */}
            {showFeatures && item.extractedFeatures && (
              <div className="mt-3 p-3 bg-slate-900 rounded-xl border border-slate-700">
                <p className="text-xs font-bold text-emerald-400 mb-2">抽出されたパラメータ:</p>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {item.extractedFeatures.map((f, idx) => (
                    <div key={idx} className="text-xs mb-2">
                      <span className="text-yellow-400 font-mono">{f.parameterName}</span>
                      <span className="text-slate-500">: </span>
                      <span className="text-white font-bold">{f.value}{f.unit ? ` ${f.unit}` : ''}</span>
                      {f.reference && <span className="text-cyan-400 text-[10px] ml-2">({f.reference})</span>}
                      <p className="text-slate-500 text-[10px] ml-2">{f.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
  );
};

export default StockItemRow;
