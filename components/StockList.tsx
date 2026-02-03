import React, { useState, useRef } from 'react';
import { StockItem } from '../types';
import { Trash2, Brain, ArrowLeft, Sparkles, Loader2, Eye, FileSpreadsheet, Plus, Camera, ImagePlus, FolderOpen } from 'lucide-react';
import { extractFeatures } from '../services/geminiService';
import { exportWasteReportFromStock, countExportableEntries } from '../services/excelExporter';
import { extractPhotoTakenAt, getEffectiveDateTime, formatDateTime } from '../services/exifUtils';

interface StockListProps {
  items: StockItem[];
  onAdd: (item: StockItem) => void;
  onUpdate: (id: string, updates: Partial<StockItem>) => void;
  onDelete: (id: string) => void;
  onAnalyze: (item: StockItem) => void;
  onViewResult: (item: StockItem) => void;  // 解析結果を表示
  onClose: () => void;
}

// キャッシュキー
const EXPORT_CONFIG_CACHE_KEY = 'tonsuuChecker_exportConfig';

// キャッシュから読み込み
const loadExportConfig = () => {
  try {
    const cached = localStorage.getItem(EXPORT_CONFIG_CACHE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (e) {
    console.error('キャッシュ読み込みエラー:', e);
  }
  return {
    wasteType: 'アスファルト殻',
    destination: '',
    unit: 'ｔ',
    projectNumber: '',
    projectName: '',
    contractorName: '',
    siteManager: ''
  };
};

const StockList: React.FC<StockListProps> = ({ items, onAdd, onUpdate, onDelete, onAnalyze, onViewResult, onClose }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTonnage, setEditTonnage] = useState('');
  const [editMaxCapacity, setEditMaxCapacity] = useState('');
  const [editMemo, setEditMemo] = useState('');
  const [editManifestNumber, setEditManifestNumber] = useState('');
  const [editImageBase64, setEditImageBase64] = useState<string | null>(null);
  const [editImageUrl, setEditImageUrl] = useState<string | null>(null);
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const [showFeatures, setShowFeatures] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportConfig, setExportConfig] = useState(loadExportConfig);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTonnage, setNewTonnage] = useState('');
  const [newMaxCapacity, setNewMaxCapacity] = useState('');
  const [newMemo, setNewMemo] = useState('');
  const [newManifestNumber, setNewManifestNumber] = useState('');
  const [newImageBase64, setNewImageBase64] = useState<string | null>(null);
  const [newImageUrl, setNewImageUrl] = useState<string | null>(null);
  const [newPhotoTakenAt, setNewPhotoTakenAt] = useState<number | undefined>(undefined);
  const [editPhotoTakenAt, setEditPhotoTakenAt] = useState<number | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  // exportConfigが変更されたらキャッシュに保存
  const updateExportConfig = (updates: Partial<typeof exportConfig>) => {
    const newConfig = { ...exportConfig, ...updates };
    setExportConfig(newConfig);
    try {
      localStorage.setItem(EXPORT_CONFIG_CACHE_KEY, JSON.stringify(newConfig));
    } catch (e) {
      console.error('キャッシュ保存エラー:', e);
    }
  };

  const handleExtractFeatures = async (item: StockItem) => {
    if (!item.actualTonnage || !item.base64Images[0]) return;
    setExtractingId(item.id);
    try {
      const { features, rawResponse } = await extractFeatures(
        item.base64Images[0],
        item.actualTonnage,
        undefined,  // 判定ステータスは使用しない
        item.maxCapacity,
        item.memo  // 車両名（メモに入力されている場合）
      );
      onUpdate(item.id, {
        extractedFeatures: features,
        featureRawResponse: rawResponse
      });
    } catch (err) {
      console.error('特徴抽出エラー:', err);
    } finally {
      setExtractingId(null);
    }
  };

  const analyzedItems = items.filter(item => (item.estimations && item.estimations.length > 0) || item.result);
  const unanalyzedItems = items.filter(item => !((item.estimations && item.estimations.length > 0) || item.result));

  const startEdit = (item: StockItem) => {
    setEditingId(item.id);
    setEditTonnage(item.actualTonnage?.toString() || '');
    setEditMaxCapacity(item.maxCapacity?.toString() || '');
    setEditMemo(item.memo || '');
    setEditManifestNumber(item.manifestNumber || '');
    setEditImageBase64(item.base64Images[0] || null);
    setEditImageUrl(item.imageUrls[0] || null);
    setEditPhotoTakenAt(item.photoTakenAt);
  };

  const saveEdit = (id: string) => {
    const actualTonnage = editTonnage ? parseFloat(editTonnage) : undefined;
    const maxCapacity = editMaxCapacity ? parseFloat(editMaxCapacity) : undefined;
    const manifestNumber = editManifestNumber.replace(/\D/g, '') || undefined;

    const updates: Partial<StockItem> = {
      actualTonnage,
      maxCapacity,
      memo: editMemo || undefined,
      manifestNumber
    };

    // 画像が変更された場合
    if (editImageBase64 && editImageUrl) {
      updates.base64Images = [editImageBase64];
      updates.imageUrls = [editImageUrl];
      // 新しい画像のEXIF撮影日時を保存
      if (editPhotoTakenAt !== undefined) {
        updates.photoTakenAt = editPhotoTakenAt;
      }
    }

    onUpdate(id, updates);
    setEditingId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditTonnage('');
    setEditMaxCapacity('');
    setEditMemo('');
    setEditManifestNumber('');
    setEditImageBase64(null);
    setEditImageUrl(null);
    setEditPhotoTakenAt(undefined);
  };

  // 画像選択ハンドラー（編集用）
  const handleEditImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      setEditImageBase64(base64);
      setEditImageUrl(dataUrl);
      // EXIFから撮影日時を抽出
      const photoTakenAt = await extractPhotoTakenAt(file);
      setEditPhotoTakenAt(photoTakenAt);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // 画像選択ハンドラー（新規追加用）
  const handleNewImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      setNewImageBase64(base64);
      setNewImageUrl(dataUrl);
      // EXIFから撮影日時を抽出
      const photoTakenAt = await extractPhotoTakenAt(file);
      setNewPhotoTakenAt(photoTakenAt);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // 新規エントリー追加
  const handleAddEntry = () => {
    const newItem: StockItem = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      photoTakenAt: newPhotoTakenAt,  // EXIFから取得した撮影日時
      base64Images: newImageBase64 ? [newImageBase64] : [],
      imageUrls: newImageUrl ? [newImageUrl] : [],
      actualTonnage: newTonnage ? parseFloat(newTonnage) : undefined,
      maxCapacity: newMaxCapacity ? parseFloat(newMaxCapacity) : undefined,
      memo: newMemo || undefined,
      manifestNumber: newManifestNumber.replace(/\D/g, '') || undefined
    };
    onAdd(newItem);
    resetAddForm();
  };

  const resetAddForm = () => {
    setShowAddForm(false);
    setNewTonnage('');
    setNewMaxCapacity('');
    setNewMemo('');
    setNewManifestNumber('');
    setNewImageBase64(null);
    setNewImageUrl(null);
    setNewPhotoTakenAt(undefined);
  };

  const renderItem = (item: StockItem) => {
    const isEditing = editingId === item.id;
    const hasAnalysis = (item.estimations && item.estimations.length > 0) || item.result;

    return (
      <div
        key={item.id}
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
                    htmlFor="edit-camera-input"
                    className="flex flex-col items-center gap-2 p-4 rounded-xl cursor-pointer hover:bg-slate-800 transition-colors"
                  >
                    <Camera size={28} className="text-blue-400" />
                    <span className="text-xs text-slate-400">カメラ</span>
                  </label>
                  <label
                    htmlFor="edit-file-input"
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
                    htmlFor="edit-camera-input"
                    className="flex items-center gap-1 px-2 py-1.5 bg-slate-800/90 hover:bg-slate-700 text-white text-xs font-bold rounded-lg transition-all border border-slate-600 cursor-pointer"
                  >
                    <Camera size={14} />
                    撮影
                  </label>
                  <label
                    htmlFor="edit-file-input"
                    className="flex items-center gap-1 px-2 py-1.5 bg-slate-800/90 hover:bg-slate-700 text-white text-xs font-bold rounded-lg transition-all border border-slate-600 cursor-pointer"
                  >
                    <FolderOpen size={14} />
                    選択
                  </label>
                </div>
              )}
              <input
                id="edit-camera-input"
                type="file"
                onChange={handleEditImageSelect}
                accept="image/*"
                capture="environment"
                className="hidden"
              />
              <input
                id="edit-file-input"
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
                  onClick={() => saveEdit(item.id)}
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
                onClick={() => startEdit(item)}
              />
            ) : (
              <div
                className="w-20 h-20 rounded-xl bg-slate-900 border border-slate-600 shrink-0 cursor-pointer hover:border-blue-500 transition-all active:scale-95 flex items-center justify-center"
                onClick={() => startEdit(item)}
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
                    onClick={() => handleExtractFeatures(item)}
                    disabled={extractingId === item.id}
                    className={`p-2 rounded-xl border transition-all active:scale-95 ${
                      item.extractedFeatures
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/20'
                    }`}
                    title={item.extractedFeatures ? '特徴抽出済み' : '特徴を抽出'}
                  >
                    {extractingId === item.id ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Sparkles size={16} />
                    )}
                  </button>
                )}
                {/* 抽出結果表示トグル */}
                {item.extractedFeatures && (
                  <button
                    onClick={() => setShowFeatures(showFeatures === item.id ? null : item.id)}
                    className="p-2 rounded-xl bg-slate-700 border border-slate-600 text-slate-400 hover:bg-slate-600 transition-all active:scale-95 text-xs"
                  >
                    {showFeatures === item.id ? '閉' : '詳'}
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
            {showFeatures === item.id && item.extractedFeatures && (
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
        {/* 新規追加ボタン */}
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl transition-all shrink-0"
        >
          <Plus size={18} />
          <span className="hidden sm:inline">追加</span>
        </button>
        {/* Excel出力ボタン */}
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
            {/* 解析済み */}
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

            {/* 未解析 */}
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
      {showAddForm && (
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
                  onChange={handleNewImageSelect}
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                />
                <input
                  id="new-file-input"
                  type="file"
                  ref={fileInputRef}
                  onChange={handleNewImageSelect}
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
                onClick={resetAddForm}
                className="px-4 py-3 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-bold rounded-xl transition-all"
              >
                キャンセル
              </button>
              <button
                onClick={handleAddEntry}
                className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2"
              >
                <Plus size={18} />
                追加
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Excel出力モーダル */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4">
          <div className="bg-slate-800 rounded-2xl p-6 w-full max-w-md border border-slate-700 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-black text-white mb-4">
              産廃集計表を出力
            </h3>
            <p className="text-sm text-slate-400 mb-6">
              伝票番号または実測値がある {countExportableEntries(items)} 件のデータをExcelに出力します
            </p>

            <div className="space-y-4 mb-6">
              {/* 工事情報 */}
              <div className="border-b border-slate-700 pb-4 mb-4">
                <p className="text-xs text-slate-500 mb-3">工事情報</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">工事番号</label>
                    <input
                      type="text"
                      value={exportConfig.projectNumber}
                      onChange={(e) => updateExportConfig({ projectNumber: e.target.value })}
                      placeholder="例: 2024-001"
                      className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">受注者名</label>
                    <input
                      type="text"
                      value={exportConfig.contractorName}
                      onChange={(e) => updateExportConfig({ contractorName: e.target.value })}
                      className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="block text-xs text-slate-400 mb-1">工事名</label>
                  <input
                    type="text"
                    value={exportConfig.projectName}
                    onChange={(e) => updateExportConfig({ projectName: e.target.value })}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="mt-3">
                  <label className="block text-xs text-slate-400 mb-1">現場代理人</label>
                  <input
                    type="text"
                    value={exportConfig.siteManager}
                    onChange={(e) => updateExportConfig({ siteManager: e.target.value })}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* 廃棄物情報 */}
              <div>
                <label className="block text-sm text-slate-400 mb-1">廃棄物の種類</label>
                <input
                  type="text"
                  value={exportConfig.wasteType}
                  onChange={(e) => updateExportConfig({ wasteType: e.target.value })}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">搬出先</label>
                <input
                  type="text"
                  value={exportConfig.destination}
                  onChange={(e) => updateExportConfig({ destination: e.target.value })}
                  placeholder="例: ○○処理センター"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">単位</label>
                <select
                  value={exportConfig.unit}
                  onChange={(e) => updateExportConfig({ unit: e.target.value })}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
                >
                  <option value="ｔ">ｔ（トン）</option>
                  <option value="㎥">㎥（立方メートル）</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-3">
              <button
                onClick={() => setShowExportModal(false)}
                className="px-4 py-3 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-bold rounded-xl transition-all"
              >
                キャンセル
              </button>
              <button
                onClick={async () => {
                  await exportWasteReportFromStock(
                    items,
                    {
                      projectNumber: exportConfig.projectNumber,
                      projectName: exportConfig.projectName,
                      contractorName: exportConfig.contractorName,
                      siteManager: exportConfig.siteManager
                    },
                    `産廃集計表_${new Date().toISOString().split('T')[0]}.xlsx`,
                    exportConfig.wasteType,
                    exportConfig.destination,
                    exportConfig.unit
                  );
                  setShowExportModal(false);
                }}
                className="flex-1 px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2"
              >
                <FileSpreadsheet size={18} />
                Excel出力
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockList;
