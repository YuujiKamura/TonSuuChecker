import React, { useState } from 'react';
import { StockItem, getJudgmentStatus, isJudged, JudgmentStatus } from '../types';
import { Trash2, Brain, ArrowLeft, Sparkles, Loader2, Eye, FileSpreadsheet } from 'lucide-react';
import { extractFeatures } from '../services/geminiService';
import { exportWasteReportFromStock } from '../services/excelExporter';

interface StockListProps {
  items: StockItem[];
  onUpdate: (id: string, updates: Partial<StockItem>) => void;
  onDelete: (id: string) => void;
  onAnalyze: (item: StockItem) => void;
  onViewResult: (item: StockItem) => void;  // 解析結果を表示
  onClose: () => void;
}

const StockList: React.FC<StockListProps> = ({ items, onUpdate, onDelete, onAnalyze, onViewResult, onClose }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTonnage, setEditTonnage] = useState('');
  const [editMaxCapacity, setEditMaxCapacity] = useState('');
  const [editMemo, setEditMemo] = useState('');
  const [editManifestNumber, setEditManifestNumber] = useState('');
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const [showFeatures, setShowFeatures] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportConfig, setExportConfig] = useState({
    wasteType: 'アスファルト殻',
    destination: '',
    unit: 'ｔ'
  });

  const handleExtractFeatures = async (item: StockItem) => {
    const status = getJudgmentStatus(item);
    if (!item.actualTonnage || status === 'unknown') return;
    setExtractingId(item.id);
    try {
      const { features, rawResponse } = await extractFeatures(
        item.base64Images[0],
        item.actualTonnage,
        status as 'OK' | 'NG',
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

  const unjudgedItems = items.filter(item => !isJudged(item));
  const judgedItems = items.filter(item => isJudged(item));
  const analyzedItems = items.filter(item => (item.estimations && item.estimations.length > 0) || item.result);

  const startEdit = (item: StockItem) => {
    setEditingId(item.id);
    setEditTonnage(item.actualTonnage?.toString() || '');
    setEditMaxCapacity(item.maxCapacity?.toString() || '');
    setEditMemo(item.memo || '');
    setEditManifestNumber(item.manifestNumber || '');
  };

  const saveEdit = (id: string) => {
    const actualTonnage = editTonnage ? parseFloat(editTonnage) : undefined;
    const maxCapacity = editMaxCapacity ? parseFloat(editMaxCapacity) : undefined;
    // マニフェスト番号は数字のみ許可（バリデーション）
    const manifestNumber = editManifestNumber.replace(/\D/g, '') || undefined;

    onUpdate(id, {
      actualTonnage,
      maxCapacity,
      memo: editMemo || undefined,
      manifestNumber
    });
    setEditingId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditTonnage('');
    setEditMaxCapacity('');
    setEditMemo('');
    setEditManifestNumber('');
  };

  const renderItem = (item: StockItem) => {
    const judgmentStatus = getJudgmentStatus(item);
    const itemIsJudged = isJudged(item);
    const isEditing = editingId === item.id;
    const hasAnalysis = (item.estimations && item.estimations.length > 0) || item.result;

    return (
      <div
        key={item.id}
        className={`bg-slate-800 border rounded-2xl p-4 ${
          hasAnalysis
            ? 'border-cyan-500/30 bg-slate-800/80'
            : itemIsJudged
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
                {judgmentStatus !== 'unknown' && (
                  <span className={`text-xs font-black px-2 py-0.5 rounded-full ${judgmentStatus === 'OK' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                    {judgmentStatus === 'OK' ? '適正' : '過積載'}
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
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={editManifestNumber}
                onChange={(e) => setEditManifestNumber(e.target.value.replace(/\D/g, ''))}
                placeholder="マニフェスト伝票番号"
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
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
              className={`w-20 h-20 rounded-xl object-cover bg-slate-900 border border-slate-600 shrink-0 cursor-pointer hover:border-blue-500 transition-all active:scale-95 ${itemIsJudged ? 'opacity-80' : ''}`}
              alt="Stock"
              onClick={() => startEdit(item)}
            />

            <div className="flex-grow min-w-0">
              {/* 日時とタグ */}
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {judgmentStatus !== 'unknown' && (
                  <span className={`text-xs font-black px-2 py-0.5 rounded-full ${judgmentStatus === 'OK' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                    {judgmentStatus === 'OK' ? '適正' : '過積載'}
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
                {item.manifestNumber && (
                  <span className="text-xs font-bold text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded-full">
                    M#{item.manifestNumber}
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
              {/* 未判定の場合はヒントを表示 */}
              {!itemIsJudged && (
                <span className="text-[9px] text-slate-500 text-center">
                  画像をタップして<br/>実測・最大積載量を入力
                </span>
              )}

              <div className="flex gap-2 flex-wrap">
                {/* 特徴抽出ボタン（判定済み+実測値がある場合） */}
                {itemIsJudged && item.actualTonnage && (
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
        <div onClick={onClose} className="cursor-pointer flex-grow">
          <h2 className="text-lg font-black text-white">ストック一覧</h2>
          <p className="text-xs text-slate-500">計量後にOK/NGを付けて学習データに</p>
        </div>
        {/* Excel出力ボタン */}
        <button
          onClick={() => setShowExportModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-xl transition-all"
        >
          <FileSpreadsheet size={18} />
          <span className="hidden sm:inline">産廃Excel</span>
          <span className="bg-emerald-800 px-2 py-0.5 rounded-full text-xs">
            {items.filter(i => i.actualTonnage).length}
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
                <p className="text-xs text-slate-500 mb-4">
                  解析結果を確認するには目のアイコンをタップ
                </p>
                <div className="space-y-3">
                  {analyzedItems.map(item => renderItem(item))}
                </div>
              </div>
            )}

            {/* 未判定（解析されていないもののみ） */}
            {unjudgedItems.filter(item => !((item.estimations && item.estimations.length > 0) || item.result)).length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-amber-500 mb-3">
                  ⏳ 判定待ち（{unjudgedItems.filter(item => !((item.estimations && item.estimations.length > 0) || item.result)).length}件）
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                  実測値と最大積載量を入力すると自動判定されます
                </p>
                <div className="space-y-3">
                  {unjudgedItems.filter(item => !((item.estimations && item.estimations.length > 0) || item.result)).map(item => renderItem(item))}
                </div>
              </div>
            )}

            {/* 判定済み（解析されていないもののみ） */}
            {judgedItems.filter(item => !((item.estimations && item.estimations.length > 0) || item.result)).length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-green-500 mb-3">
                  ✓ 判定済み（{judgedItems.filter(item => !((item.estimations && item.estimations.length > 0) || item.result)).length}件）
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                  このデータはAI解析の参考として使われます
                </p>
                <div className="space-y-3">
                  {judgedItems.filter(item => !((item.estimations && item.estimations.length > 0) || item.result)).map(item => renderItem(item))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Excel出力モーダル */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4">
          <div className="bg-slate-800 rounded-2xl p-6 w-full max-w-md border border-slate-700">
            <h3 className="text-lg font-black text-white mb-4">
              産廃集計表を出力
            </h3>
            <p className="text-sm text-slate-400 mb-6">
              実測トン数が入力された {items.filter(i => i.actualTonnage).length} 件のデータをExcelに出力します
            </p>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm text-slate-400 mb-1">廃棄物の種類</label>
                <input
                  type="text"
                  value={exportConfig.wasteType}
                  onChange={(e) => setExportConfig({ ...exportConfig, wasteType: e.target.value })}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">搬出先</label>
                <input
                  type="text"
                  value={exportConfig.destination}
                  onChange={(e) => setExportConfig({ ...exportConfig, destination: e.target.value })}
                  placeholder="例: 大林道路株式会社"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">単位</label>
                <select
                  value={exportConfig.unit}
                  onChange={(e) => setExportConfig({ ...exportConfig, unit: e.target.value })}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
                >
                  <option value="ｔ">ｔ（トン）</option>
                  <option value="㎥">㎥（立方メートル）</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={async () => {
                  await exportWasteReportFromStock(
                    items,
                    {}, // 工事情報は空（必要に応じて別途設定可能）
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
                Excelをダウンロード
              </button>
              <button
                onClick={() => setShowExportModal(false)}
                className="px-4 py-3 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-bold rounded-xl transition-all"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockList;
