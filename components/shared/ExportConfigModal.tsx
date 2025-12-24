import React, { useState, useEffect } from 'react';
import { StockItem } from '../../types';
import { FileSpreadsheet, X } from 'lucide-react';
import { exportWasteReportFromStock, countExportableEntries } from '../../services/excelExporter';

// キャッシュキー
const EXPORT_CONFIG_CACHE_KEY = 'tonsuuChecker_exportConfig';

// デフォルト設定
const defaultConfig = {
  wasteType: 'アスファルト殻',
  destination: '',
  unit: 'ｔ',
  projectNumber: '',
  projectName: '',
  contractorName: '',
  siteManager: ''
};

// キャッシュから読み込み
export const loadExportConfig = () => {
  try {
    const cached = localStorage.getItem(EXPORT_CONFIG_CACHE_KEY);
    if (cached) {
      return { ...defaultConfig, ...JSON.parse(cached) };
    }
  } catch (e) {
    console.error('キャッシュ読み込みエラー:', e);
  }
  return defaultConfig;
};

// キャッシュに保存
export const saveExportConfig = (config: typeof defaultConfig) => {
  try {
    localStorage.setItem(EXPORT_CONFIG_CACHE_KEY, JSON.stringify(config));
  } catch (e) {
    console.error('キャッシュ保存エラー:', e);
  }
};

interface ExportConfigModalProps {
  items: StockItem[];
  isOpen: boolean;
  onClose: () => void;
}

const ExportConfigModal: React.FC<ExportConfigModalProps> = ({ items, isOpen, onClose }) => {
  const [config, setConfig] = useState(loadExportConfig);

  useEffect(() => {
    if (isOpen) {
      setConfig(loadExportConfig());
    }
  }, [isOpen]);

  const updateConfig = (updates: Partial<typeof config>) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    saveExportConfig(newConfig);
  };

  const handleExport = async () => {
    await exportWasteReportFromStock(
      items,
      {
        projectNumber: config.projectNumber,
        projectName: config.projectName,
        contractorName: config.contractorName,
        siteManager: config.siteManager
      },
      `産廃集計表_${new Date().toISOString().split('T')[0]}.xlsx`,
      config.wasteType,
      config.destination,
      config.unit
    );
    onClose();
  };

  if (!isOpen) return null;

  const exportableCount = countExportableEntries(items);

  return (
    <div className="fixed inset-0 bg-black/80 z-[130] flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* ヘッダー */}
        <div className="sticky top-0 bg-slate-900 border-b border-slate-800 p-3 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={18} className="text-emerald-400" />
            <h3 className="text-sm font-bold text-white">Excel出力設定</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-all">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* 出力件数 */}
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 text-center">
            <p className="text-emerald-400 text-sm font-bold">
              {exportableCount}件 のデータを出力
            </p>
            <p className="text-slate-500 text-[10px] mt-1">
              伝票番号または実測値があるエントリー
            </p>
          </div>

          {/* 工事情報 */}
          <div className="space-y-3">
            <p className="text-[10px] text-slate-500 font-bold uppercase">工事情報</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">工事番号</label>
                <input
                  type="text"
                  value={config.projectNumber}
                  onChange={(e) => updateConfig({ projectNumber: e.target.value })}
                  placeholder="2024-001"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">受注者名</label>
                <input
                  type="text"
                  value={config.contractorName}
                  onChange={(e) => updateConfig({ contractorName: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">工事名</label>
              <input
                type="text"
                value={config.projectName}
                onChange={(e) => updateConfig({ projectName: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">現場代理人</label>
              <input
                type="text"
                value={config.siteManager}
                onChange={(e) => updateConfig({ siteManager: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* 廃棄物情報 */}
          <div className="space-y-3 pt-2 border-t border-slate-800">
            <p className="text-[10px] text-slate-500 font-bold uppercase">廃棄物情報</p>
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">廃棄物の種類</label>
              <input
                type="text"
                value={config.wasteType}
                onChange={(e) => updateConfig({ wasteType: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">搬出先</label>
              <input
                type="text"
                value={config.destination}
                onChange={(e) => updateConfig({ destination: e.target.value })}
                placeholder="○○処理センター"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">単位</label>
              <select
                value={config.unit}
                onChange={(e) => updateConfig({ unit: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-emerald-500"
              >
                <option value="ｔ">ｔ（トン）</option>
                <option value="㎥">㎥（立方メートル）</option>
              </select>
            </div>
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
            onClick={handleExport}
            disabled={exportableCount === 0}
            className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2"
          >
            <FileSpreadsheet size={16} />
            Excel出力
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportConfigModal;
