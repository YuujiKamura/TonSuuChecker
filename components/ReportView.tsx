import React, { useState } from 'react';
import { StockItem } from '../types';
import { FileSpreadsheet, Plus, ArrowLeft, Trash2, Eye, Brain } from 'lucide-react';
import { countExportableEntries } from '../services/excelExporter';
import EntryEditForm from './shared/EntryEditForm';
import ExportConfigModal, { loadExportConfig } from './shared/ExportConfigModal';

interface ReportViewProps {
  items: StockItem[];
  onAdd: (item: StockItem) => void;
  onUpdate: (id: string, updates: Partial<StockItem>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  onAnalyze?: (item: StockItem) => void;
  onViewResult?: (item: StockItem) => void;
}

const ReportView: React.FC<ReportViewProps> = ({
  items,
  onAdd,
  onUpdate,
  onDelete,
  onClose,
  onAnalyze,
  onViewResult
}) => {
  const [editingItem, setEditingItem] = useState<StockItem | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const exportConfig = loadExportConfig();

  // 出力対象アイテム（マニフェスト番号 or 実測値あり）
  const exportableItems = items
    .filter(item => item.manifestNumber || item.actualTonnage)
    .sort((a, b) => a.timestamp - b.timestamp);

  // 合計計算
  const total = exportableItems.reduce((sum, item) => sum + (item.actualTonnage || 0), 0);

  // 新規エントリー追加
  const addNewEntry = () => {
    const newItem: StockItem = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      base64Images: [],
      imageUrls: []
    };
    onAdd(newItem);
    setEditingItem(newItem);
  };

  // 日付フォーマット
  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  return (
    <div className="fixed inset-0 bg-slate-950 z-[100] flex flex-col">
      {/* ヘッダー */}
      <div className="bg-slate-900 border-b border-slate-800 p-3 flex items-center gap-2">
        <button
          onClick={onClose}
          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all shrink-0"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-white truncate">建設廃棄物処理実績集計表</h2>
          <p className="text-[10px] text-slate-500 truncate">
            {exportConfig.wasteType} / {exportConfig.destination || '搬出先未設定'}
          </p>
        </div>
        <button
          onClick={() => setShowExportModal(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-xs font-bold rounded-lg transition-all shrink-0"
        >
          <FileSpreadsheet size={16} />
          <span className="hidden sm:inline">Excel</span>
          <span className="bg-emerald-700 px-1.5 py-0.5 rounded text-[10px]">{countExportableEntries(items)}</span>
        </button>
      </div>

      {/* 帳票テーブル */}
      <div className="flex-1 overflow-auto pb-20">
        <table className="w-full text-xs border-collapse">
          <thead className="bg-slate-800 sticky top-0 z-10">
            <tr className="text-slate-400">
              <th className="p-2 text-center border-b border-slate-700 w-8">#</th>
              <th className="p-2 text-left border-b border-slate-700 w-12">日付</th>
              <th className="p-2 text-left border-b border-slate-700">マニデン</th>
              <th className="p-2 text-right border-b border-slate-700 w-16">搬出量</th>
              <th className="p-2 text-left border-b border-slate-700">備考</th>
              <th className="p-2 w-20 border-b border-slate-700"></th>
            </tr>
          </thead>
          <tbody>
            {exportableItems.map((item, idx) => {
              const hasAnalysis = (item.estimations && item.estimations.length > 0) || item.result;
              return (
                <tr
                  key={item.id}
                  onClick={() => setEditingItem(item)}
                  className={`border-b border-slate-800 cursor-pointer transition-colors ${
                    hasAnalysis
                      ? 'bg-cyan-900/10 hover:bg-cyan-900/20'
                      : 'hover:bg-slate-800/50'
                  }`}
                >
                  <td className="p-2 text-center text-slate-500">{idx + 1}</td>
                  <td className="p-2 text-slate-400 text-[10px]">{formatDate(item.timestamp)}</td>
                  <td className="p-2">
                    <span className={item.manifestNumber ? 'text-amber-400 font-mono' : 'text-slate-600'}>
                      {item.manifestNumber || '-'}
                    </span>
                  </td>
                  <td className="p-2 text-right">
                    <span className={item.actualTonnage ? 'text-green-400 font-bold' : 'text-slate-600'}>
                      {item.actualTonnage?.toFixed(2) || '-'}
                    </span>
                  </td>
                  <td className="p-2">
                    <span className="text-slate-400 truncate block max-w-[80px]">
                      {item.memo || ''}
                    </span>
                  </td>
                  <td className="p-2" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1 justify-end">
                      {hasAnalysis && onViewResult && (
                        <button
                          onClick={() => { onClose(); onViewResult(item); }}
                          className="p-1.5 rounded bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-colors"
                          title="結果を見る"
                        >
                          <Eye size={12} />
                        </button>
                      )}
                      {item.imageUrls[0] && onAnalyze && (
                        <button
                          onClick={() => { onClose(); onAnalyze(item); }}
                          className="p-1.5 rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
                          title="AI解析"
                        >
                          <Brain size={12} />
                        </button>
                      )}
                      <button
                        onClick={() => onDelete(item.id)}
                        className="p-1.5 rounded bg-slate-700 text-slate-500 hover:bg-red-500/20 hover:text-red-400 transition-colors"
                        title="削除"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {/* 空行（データがない場合） */}
            {exportableItems.length === 0 && (
              <tr className="border-b border-slate-800">
                <td colSpan={6} className="p-8 text-center text-slate-500">
                  <p className="mb-2">データがありません</p>
                  <p className="text-[10px]">下のボタンから追加してください</p>
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="bg-slate-800 sticky bottom-0">
            <tr className="font-bold">
              <td colSpan={3} className="p-2 text-right text-slate-400 text-xs">合計</td>
              <td className="p-2 text-right text-yellow-400">{total.toFixed(2)}</td>
              <td colSpan={2} className="p-2 text-slate-500 text-[10px]">{exportableItems.length}件</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* 追加ボタン（フローティング） */}
      <div className="absolute bottom-4 right-4">
        <button
          onClick={addNewEntry}
          className="w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all active:scale-95 bg-blue-600 hover:bg-blue-500"
        >
          <Plus size={28} className="text-white" />
        </button>
      </div>

      {/* 編集モーダル */}
      <EntryEditForm
        item={editingItem}
        isOpen={!!editingItem}
        onSave={(id, updates) => {
          onUpdate(id, updates);
          setEditingItem(null);
        }}
        onClose={() => setEditingItem(null)}
        onAnalyze={onAnalyze ? (item) => { onClose(); onAnalyze(item); } : undefined}
        onViewResult={onViewResult ? (item) => { onClose(); onViewResult(item); } : undefined}
      />

      {/* Excel出力設定モーダル */}
      <ExportConfigModal
        items={items}
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
      />
    </div>
  );
};

export default ReportView;
