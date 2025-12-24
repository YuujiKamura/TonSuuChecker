import React, { useState } from 'react';
import { StockItem } from '../types';
import { Check, X, Trash2, Brain, ArrowLeft, RotateCcw, Sparkles, Loader2, Eye } from 'lucide-react';
import { extractFeatures } from '../services/geminiService';

interface StockListProps {
  items: StockItem[];
  onTag: (id: string, tag: 'OK' | 'NG') => void;
  onUpdate: (id: string, updates: Partial<StockItem>) => void;
  onDelete: (id: string) => void;
  onAnalyze: (item: StockItem) => void;
  onViewResult: (item: StockItem) => void;  // 解析結果を表示
  onClose: () => void;
}

const StockList: React.FC<StockListProps> = ({ items, onTag, onUpdate, onDelete, onAnalyze, onViewResult, onClose }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTonnage, setEditTonnage] = useState('');
  const [editMaxCapacity, setEditMaxCapacity] = useState('');
  const [editMemo, setEditMemo] = useState('');
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const [showFeatures, setShowFeatures] = useState<string | null>(null);

  const handleExtractFeatures = async (item: StockItem) => {
    if (!item.actualTonnage || !item.tag) return;
    setExtractingId(item.id);
    try {
      const { features, rawResponse } = await extractFeatures(
        item.base64Images[0],
        item.actualTonnage,
        item.tag,
        item.maxCapacity
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

  const untaggedItems = items.filter(item => !item.tag);
  const taggedItems = items.filter(item => item.tag);
  const analyzedItems = items.filter(item => (item.estimations && item.estimations.length > 0) || item.result);

  const startEdit = (item: StockItem) => {
    setEditingId(item.id);
    setEditTonnage(item.actualTonnage?.toString() || '');
    setEditMaxCapacity(item.maxCapacity?.toString() || '');
    setEditMemo(item.memo || '');
  };

  const saveEdit = (id: string) => {
    const actualTonnage = editTonnage ? parseFloat(editTonnage) : undefined;
    const maxCapacity = editMaxCapacity ? parseFloat(editMaxCapacity) : undefined;
    
    // 実測と最大積載量が両方入力されていれば自動判定
    let tag: 'OK' | 'NG' | undefined = undefined;
    if (actualTonnage !== undefined && maxCapacity !== undefined) {
      tag = actualTonnage <= maxCapacity ? 'OK' : 'NG';
    }
    
    onUpdate(id, {
      actualTonnage,
      maxCapacity,
      memo: editMemo || undefined,
      ...(tag !== undefined ? { tag } : {})
    });
    setEditingId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditTonnage('');
    setEditMaxCapacity('');
    setEditMemo('');
  };

  const resetTag = (id: string) => {
    onUpdate(id, { tag: undefined });
  };

  const renderItem = (item: StockItem, isTagged: boolean) => {
    const isEditing = editingId === item.id;
    const hasAnalysis = (item.estimations && item.estimations.length > 0) || item.result;

    return (
      <div
        key={item.id}
        className={`bg-slate-800 border rounded-2xl p-4 ${
          hasAnalysis 
            ? 'border-cyan-500/30 bg-slate-800/80' 
            : isTagged 
              ? 'border-slate-700/50 bg-slate-800/50' 
              : 'border-slate-700'
        } ${isEditing ? 'border-blue-500/50' : ''}`}
      >
        {/* 編集モード：大きい画像とフォーム */}
        {isEditing ? (
          <div className="space-y-4">
            <img
              src={item.imageUrls[0]}
              className="w-full max-h-[70vh] rounded-xl object-contain bg-slate-900 border border-slate-600 cursor-pointer"
              alt="Stock"
              onClick={cancelEdit}
            />
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                {item.tag && (
                  <span className={`text-xs font-black px-2 py-0.5 rounded-full ${item.tag === 'OK' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                    {item.tag === 'OK' ? '適正' : '過積載'}
                  </span>
                )}
                <span className="text-xs text-slate-500">
                  {new Date(item.timestamp).toLocaleString()}
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
              <div className="flex gap-2">
                <button
                  onClick={() => saveEdit(item.id)}
                  className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl transition-all"
                >
                  保存
                </button>
                <button
                  onClick={cancelEdit}
                  className="px-4 py-3 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-bold rounded-xl transition-all"
                >
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* 通常表示 */
          <div className="flex items-start gap-4">
            <img
              src={item.imageUrls[0]}
              className={`w-20 h-20 rounded-xl object-cover bg-slate-900 border border-slate-600 shrink-0 cursor-pointer hover:border-blue-500 transition-all active:scale-95 ${isTagged ? 'opacity-80' : ''}`}
              alt="Stock"
              onClick={() => startEdit(item)}
            />

            <div className="flex-grow min-w-0">
              {/* 日時とタグ */}
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {item.tag && (
                  <span className={`text-xs font-black px-2 py-0.5 rounded-full ${item.tag === 'OK' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                    {item.tag === 'OK' ? '適正' : '過積載'}
                  </span>
                )}
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
                <span className="text-xs text-slate-500">
                  {new Date(item.timestamp).toLocaleString()}
                </span>
              </div>

              {item.memo && (
                <p className="text-sm text-slate-400 truncate">{item.memo}</p>
              )}
            </div>

            {/* アクションボタン */}
            <div className="flex flex-col gap-2 shrink-0">
              {/* 実測と最大積載量が未入力の場合のみ手動判定ボタンを表示 */}
              {!isTagged && !(item.actualTonnage && item.maxCapacity) ? (
                // 未判定かつ自動判定不可：手動判定ボタン
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] text-slate-500 text-center">過積載？</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => onTag(item.id, 'OK')}
                      className="flex flex-col items-center gap-1 p-3 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20 transition-all active:scale-95"
                      title="適正積載（過積載ではない）"
                    >
                      <Check size={20} />
                      <span className="text-[10px] font-bold">適正</span>
                    </button>
                    <button
                      onClick={() => onTag(item.id, 'NG')}
                      className="flex flex-col items-center gap-1 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-all active:scale-95"
                      title="過積載"
                    >
                      <X size={20} />
                      <span className="text-[10px] font-bold">過積載</span>
                    </button>
                  </div>
                  <span className="text-[8px] text-slate-600 text-center">または実測・最大積載量を入力</span>
                </div>
              ) : isTagged ? (
                // 判定済み：判定やり直しボタン
                <button
                  onClick={() => resetTag(item.id)}
                  className="flex items-center gap-2 p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition-all active:scale-95 text-xs font-bold"
                  title="過積載/適正の判定をやり直す"
                >
                  <RotateCcw size={14} />
                  判定取消
                </button>
              ) : null}

              <div className="flex gap-2 flex-wrap">
                {/* 特徴抽出ボタン（タグ+実測値がある場合） */}
                {isTagged && item.actualTonnage && (
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
                {/* AI解析ボタン（再解析用） */}
                <button
                  onClick={() => onAnalyze(item)}
                  className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 hover:bg-blue-500/20 transition-all active:scale-95"
                  title="AI解析"
                >
                  <Brain size={16} />
                </button>
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
    <div className="fixed inset-0 bg-slate-950 z-50 flex flex-col">
      {/* ヘッダー */}
      <div className="bg-slate-900 border-b border-slate-800 p-4 flex items-center gap-4">
        <button
          onClick={onClose}
          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all"
        >
          <ArrowLeft size={20} />
        </button>
        <div onClick={onClose} className="cursor-pointer">
          <h2 className="text-lg font-black text-white">ストック一覧</h2>
          <p className="text-xs text-slate-500">計量後にOK/NGを付けて学習データに</p>
        </div>
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
                <p className="text-xs text-slate-500 mb-4">
                  解析結果を確認するには目のアイコンをタップ
                </p>
                <div className="space-y-3">
                  {analyzedItems.map(item => renderItem(item, !!item.tag))}
                </div>
              </div>
            )}

            {/* 未判定（解析されていないもののみ） */}
            {untaggedItems.filter(item => !((item.estimations && item.estimations.length > 0) || item.result)).length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-amber-500 mb-3">
                  ⏳ 判定待ち（{untaggedItems.filter(item => !((item.estimations && item.estimations.length > 0) || item.result)).length}件）
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                  計量結果がわかったら、適正積載ならOK、過積載ならNGを押してください
                </p>
                <div className="space-y-3">
                  {untaggedItems.filter(item => !((item.estimations && item.estimations.length > 0) || item.result)).map(item => renderItem(item, false))}
                </div>
              </div>
            )}

            {/* 判定済み（解析されていないもののみ） */}
            {taggedItems.filter(item => !((item.estimations && item.estimations.length > 0) || item.result)).length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-green-500 mb-3">
                  ✓ 判定済み（{taggedItems.filter(item => !((item.estimations && item.estimations.length > 0) || item.result)).length}件）
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                  このデータはAI解析の参考として使われます
                </p>
                <div className="space-y-3">
                  {taggedItems.filter(item => !((item.estimations && item.estimations.length > 0) || item.result)).map(item => renderItem(item, true))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default StockList;
