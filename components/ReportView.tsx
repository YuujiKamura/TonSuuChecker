import React, { useState, useEffect, useMemo } from 'react';
import { StockItem } from '../types';
import { FileSpreadsheet, Plus, ArrowLeft, Trash2, Eye, Brain, Sun, Moon } from 'lucide-react';
import { countExportableEntries, exportPhotoReportFromStock } from '../services/excelExporter';
import { ExportSettings } from './shared/ExportConfigModal';
import EntryEditForm from './shared/EntryEditForm';
import ExportConfigModal from './shared/ExportConfigModal';
import { getEffectiveDateTime, formatDateTime } from '../services/exifUtils';

// テーマ設定
const THEME_KEY = 'tonsuuChecker_theme';
const getStoredTheme = () => localStorage.getItem(THEME_KEY) || 'light';
const setStoredTheme = (theme: string) => localStorage.setItem(THEME_KEY, theme);

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
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [isNewItem, setIsNewItem] = useState(false);  // 新規作成モードかどうか
  const [newItemData, setNewItemData] = useState<StockItem | null>(null);  // 新規作成時の一時データ

  // 編集中のアイテムを派生状態として取得（常に最新のitemsから参照）
  const currentEditingItem = useMemo(() => {
    if (isNewItem && newItemData) return newItemData;
    if (!editingItemId) return null;
    return items.find(i => i.id === editingItemId) ?? null;
  }, [editingItemId, items, isNewItem, newItemData]);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showPhotoExportModal, setShowPhotoExportModal] = useState(false);
  const [theme, setTheme] = useState(getStoredTheme);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    setStoredTheme(newTheme);
  };

  const isDark = theme === 'dark';

  // 出力対象アイテム（マニフェスト番号 or 実測値あり）
  // photoTakenAt（撮影日時）優先、なければtimestamp（登録日時）でソート
  const exportableItems = items
    .filter(item => item.manifestNumber || item.actualTonnage)
    .sort((a, b) => getEffectiveDateTime(a) - getEffectiveDateTime(b));

  // 合計計算
  const total = exportableItems.reduce((sum, item) => sum + (item.actualTonnage || 0), 0);

  // 写真付きアイテム（base64Imagesが存在するもの）
  const itemsWithPhotos = exportableItems.filter(item => item.base64Images && item.base64Images.length > 0);

  // 新規エントリー追加（保存は編集フォームで行う）
  const addNewEntry = () => {
    const newItem: StockItem = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      base64Images: [],
      imageUrls: []
    };
    setNewItemData(newItem);
    setIsNewItem(true);  // 新規作成モードをオン
  };

  // 日時フォーマット - exifUtilsのformatDateTimeを使用

  // 廃棄物の種類の略称マップ（モバイル用）
  const wasteTypeShortMap: Record<string, string> = {
    'アスファルト殻': 'As殻',
    'コンクリート無筋': 'Co無筋',
    'コンクリート有筋': 'Co有筋',
  };
  const getShortWasteType = (type: string | undefined) => {
    if (!type) return '-';
    return wasteTypeShortMap[type] || type;
  };

  return (
    <div className={`fixed inset-0 z-[100] flex flex-col ${isDark ? 'bg-slate-950' : 'bg-gray-100'}`}>
      {/* ヘッダー */}
      <div className={`p-3 flex items-center gap-2 ${isDark ? 'bg-slate-900 border-b border-slate-800' : 'bg-white border-b border-gray-300'}`}>
        <button
          onClick={onClose}
          className={`p-2 rounded transition-all shrink-0 ${isDark ? 'text-slate-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'}`}
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className={`flex-1 text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>建設廃棄物処理実績集計表</h1>
        <button
          onClick={toggleTheme}
          className={`p-2 rounded transition-all shrink-0 ${isDark ? 'text-slate-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'}`}
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <button
          onClick={() => setShowExportModal(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded transition-all shrink-0"
        >
          <FileSpreadsheet size={16} />
          <span>Excel ({countExportableEntries(items)})</span>
        </button>
        <button
          onClick={() => setShowPhotoExportModal(true)}
          disabled={itemsWithPhotos.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-500 text-white text-sm rounded transition-all shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="text-base">📷</span>
          <span>写真付き ({itemsWithPhotos.length})</span>
        </button>
      </div>

      {/* 帳票テーブル */}
      <div className="flex-1 overflow-auto pb-20">
        <table className={`w-full text-sm border-collapse ${isDark ? '' : 'bg-white'}`}>
          <thead className={`sticky top-0 z-10 ${isDark ? 'bg-slate-800 text-gray-300' : 'bg-gray-100 text-gray-700'}`}>
            <tr>
              <th className={`p-2 text-center border-b w-10 whitespace-nowrap ${isDark ? 'border-slate-700' : 'border-gray-300'}`}>No</th>
              <th className={`p-2 text-left border-b whitespace-nowrap ${isDark ? 'border-slate-700' : 'border-gray-300'}`}>
                <span className="hidden sm:inline">廃棄物の種類</span>
                <span className="sm:hidden">種類</span>
              </th>
              <th className={`p-2 text-left border-b whitespace-nowrap ${isDark ? 'border-slate-700' : 'border-gray-300'}`}>撮影日時</th>
              <th className={`p-2 text-left border-b whitespace-nowrap ${isDark ? 'border-slate-700' : 'border-gray-300'}`}>
                <span className="hidden sm:inline">マニフェスト伝票番号</span>
                <span className="sm:hidden">伝票No</span>
              </th>
              <th className={`p-2 text-right border-b w-16 whitespace-nowrap ${isDark ? 'border-slate-700' : 'border-gray-300'}`}>搬出量</th>
              <th className={`p-2 text-left border-b whitespace-nowrap ${isDark ? 'border-slate-700' : 'border-gray-300'}`}>備考</th>
              <th className={`p-2 w-16 border-b ${isDark ? 'border-slate-700' : 'border-gray-300'}`}></th>
            </tr>
          </thead>
          <tbody>
            {exportableItems.map((item, idx) => {
              const hasAnalysis = (item.estimations && item.estimations.length > 0) || item.result;
              const textColor = isDark ? 'text-gray-200' : 'text-gray-800';
              const mutedColor = isDark ? 'text-gray-500' : 'text-gray-400';
              return (
                <tr
                  key={item.id}
                  onClick={() => { setEditingItemId(item.id); setIsNewItem(false); }}
                  className={`border-b cursor-pointer ${isDark ? 'border-slate-700 hover:bg-slate-800' : 'border-gray-200 hover:bg-gray-50'}`}
                >
                  <td className={`p-2 text-center ${mutedColor}`}>{idx + 1}</td>
                  <td className={`p-2 whitespace-nowrap ${item.wasteType ? textColor : mutedColor}`}>
                    <span className="hidden sm:inline">{item.wasteType || '-'}</span>
                    <span className="sm:hidden">{getShortWasteType(item.wasteType)}</span>
                  </td>
                  <td className={`p-2 whitespace-nowrap ${textColor}`} title={item.photoTakenAt ? '撮影日時（EXIF）' : '登録日時'}>
                    {formatDateTime(getEffectiveDateTime(item))}
                    {item.photoTakenAt && <span className="ml-1 text-cyan-400 text-xs">📷</span>}
                  </td>
                  <td className={`p-2 font-mono ${item.manifestNumber ? textColor : mutedColor}`}>{item.manifestNumber || '-'}</td>
                  <td className={`p-2 text-right ${item.actualTonnage ? textColor : mutedColor}`}>{item.actualTonnage?.toFixed(2) || '-'}</td>
                  <td className={`p-2 ${textColor}`}>
                    {item.maxCapacity && (
                      <>
                        <span className="hidden sm:inline">最大積載量: {item.maxCapacity}t </span>
                        <span className="sm:hidden">最大: {item.maxCapacity}t </span>
                      </>
                    )}
                    {item.memo && <span>車番: {item.memo}</span>}
                  </td>
                  <td className="p-2" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-2 justify-end">
                      {hasAnalysis && onViewResult && (
                        <button
                          onClick={() => { onClose(); onViewResult(item); }}
                          className={`p-2 rounded ${isDark ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-800'}`}
                        >
                          <Eye size={20} />
                        </button>
                      )}
                      {item.imageUrls[0] && onAnalyze && (
                        <button
                          onClick={() => { onClose(); onAnalyze(item); }}
                          className={`p-2 rounded ${isDark ? 'text-green-400 hover:text-green-300' : 'text-green-600 hover:text-green-800'}`}
                        >
                          <Brain size={20} />
                        </button>
                      )}
                      <button
                        onClick={() => onDelete(item.id)}
                        className={`p-2 rounded ${isDark ? 'text-gray-400 hover:text-red-400' : 'text-gray-500 hover:text-red-500'}`}
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {/* 空行（データがない場合） */}
            {exportableItems.length === 0 && (
              <tr className={`border-b ${isDark ? 'border-slate-800' : 'border-gray-200'}`}>
                <td colSpan={7} className={`p-8 text-center ${isDark ? 'text-slate-500' : 'text-gray-500'}`}>
                  <p className="mb-2">データがありません</p>
                  <p className="text-xs">下のボタンから追加してください</p>
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className={`sticky bottom-0 ${isDark ? 'bg-slate-800 text-gray-300' : 'bg-gray-100 text-gray-700'}`}>
            <tr>
              <td colSpan={4} className="p-2 text-right font-bold">合計</td>
              <td className="p-2 text-right font-bold">{total.toFixed(2)}</td>
              <td colSpan={2} className="p-2">{exportableItems.length}件</td>
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
        item={currentEditingItem}
        isOpen={!!currentEditingItem}
        isNew={isNewItem}
        onSave={(id, updates) => {
          onUpdate(id, updates);
          setEditingItemId(null);
        }}
        onCreate={(newItem) => {
          onAdd(newItem);
          setNewItemData(null);
          setIsNewItem(false);
        }}
        onClose={() => { setEditingItemId(null); setNewItemData(null); setIsNewItem(false); }}
        onAnalyze={onAnalyze ? (item) => { onClose(); onAnalyze(item); } : undefined}
        onViewResult={onViewResult ? (item) => { onClose(); onViewResult(item); } : undefined}
      />

      {/* Excel出力設定モーダル */}
      <ExportConfigModal
        items={items}
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
      />

      {/* 写真付きExcel出力設定モーダル */}
      <ExportConfigModal
        items={itemsWithPhotos}
        isOpen={showPhotoExportModal}
        onClose={() => setShowPhotoExportModal(false)}
        title="写真付きExcel出力設定"
        exportLabel="写真付きExcel出力"
        itemCountLabel="写真付きのエントリー"
        onExport={async (config: ExportSettings) => {
          await exportPhotoReportFromStock(
            itemsWithPhotos,
            {
              projectNumber: config.projectNumber,
              projectName: config.projectName,
              contractorName: config.contractorName,
              siteManager: config.siteManager
            },
            `積載量管理写真_${new Date().toISOString().split('T')[0]}.xlsx`
          );
        }}
      />
    </div>
  );
};

export default ReportView;
