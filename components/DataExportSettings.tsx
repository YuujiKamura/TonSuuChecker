import React, { useState, useRef, useEffect } from 'react';
import { Download, Upload, FileJson, CheckCircle, AlertCircle, Image, MessageSquare, DollarSign, Loader2 } from 'lucide-react';
import {
  exportAllData,
  downloadAsJson,
  estimateExportSize,
  importFromJson,
  previewImportFile,
  ExportOptions,
  ImportResult,
} from '../services/jsonExporter';
import * as idb from '../services/indexedDBService';

interface DataExportSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  embedded?: boolean;
  onDataChanged?: () => void; // インポート後にリストを更新するためのコールバック
}

const DataExportSettings: React.FC<DataExportSettingsProps> = ({
  embedded = false,
  onDataChanged,
}) => {
  // エクスポート設定
  const [includeImages, setIncludeImages] = useState(true);
  const [includeChatHistory, setIncludeChatHistory] = useState(false);
  const [includeCostHistory, setIncludeCostHistory] = useState(false);
  const [estimatedSize, setEstimatedSize] = useState<number | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);

  // インポート設定
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<{
    valid: boolean;
    stockCount?: number;
    vehiclesCount?: number;
    hasImages?: boolean;
    exportedAt?: string;
    error?: string;
  } | null>(null);
  const [mergeStrategy, setMergeStrategy] = useState<'merge' | 'skip' | 'replace'>('merge');
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // データ件数
  const [dataStats, setDataStats] = useState({ stock: 0, vehicles: 0 });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // データ件数を取得
  useEffect(() => {
    const loadStats = async () => {
      const stock = await idb.getAllStock();
      const vehicles = await idb.getAllVehicles();
      setDataStats({ stock: stock.length, vehicles: vehicles.length });
    };
    loadStats();
  }, []);

  // エクスポートサイズを見積もり
  useEffect(() => {
    const estimate = async () => {
      const size = await estimateExportSize({
        includeImages,
        includeChatHistory,
        includeCostHistory,
      });
      setEstimatedSize(size);
    };
    estimate();
  }, [includeImages, includeChatHistory, includeCostHistory]);

  // エクスポート実行
  const handleExport = async () => {
    setIsExporting(true);
    setExportSuccess(false);
    try {
      const data = await exportAllData({
        includeImages,
        includeChatHistory,
        includeCostHistory,
      });
      downloadAsJson(data);
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 3000);
    } catch (err) {
      console.error('エクスポートエラー:', err);
    } finally {
      setIsExporting(false);
    }
  };

  // ファイル選択
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFile(file);
    setImportResult(null);

    const preview = await previewImportFile(file);
    setImportPreview(preview);
  };

  // インポート実行
  const handleImport = async () => {
    if (!importFile) return;

    setIsImporting(true);
    try {
      const result = await importFromJson(importFile, { mergeStrategy });
      setImportResult(result);

      if (result.success) {
        // データ件数を再取得（エクスポートセクションの表示を更新）
        const stock = await idb.getAllStock();
        const vehicles = await idb.getAllVehicles();
        setDataStats({ stock: stock.length, vehicles: vehicles.length });

        // 親コンポーネントに通知（UI側のstateをリセット）
        if (onDataChanged) {
          onDataChanged();
        }
      }
    } catch (err) {
      console.error('インポートエラー:', err);
    } finally {
      setIsImporting(false);
    }
  };

  // リセット
  const resetImport = () => {
    setImportFile(null);
    setImportPreview(null);
    setImportResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      {/* エクスポート */}
      <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700">
        <div className="flex items-center gap-2 mb-4">
          <Download size={18} className="text-green-500" />
          <h3 className="text-sm font-bold text-white">データエクスポート</h3>
        </div>

        <p className="text-xs text-slate-400 mb-4">
          全データをJSONファイルとしてダウンロードします。
          デバイス間の移行やバックアップに使えます。
        </p>

        {/* 現在のデータ件数 */}
        <div className="bg-slate-900/50 rounded-xl p-3 mb-4">
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">案件データ</span>
            <span className="text-white font-bold">{dataStats.stock}件</span>
          </div>
          <div className="flex justify-between text-xs mt-1">
            <span className="text-slate-400">登録車両</span>
            <span className="text-white font-bold">{dataStats.vehicles}件</span>
          </div>
        </div>

        {/* オプション */}
        <div className="space-y-2 mb-4">
          <label className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-700/50 cursor-pointer">
            <input
              type="checkbox"
              checked={includeImages}
              onChange={(e) => setIncludeImages(e.target.checked)}
              className="w-4 h-4 accent-green-500"
            />
            <Image size={16} className="text-slate-400" />
            <span className="text-xs text-slate-300 flex-1">画像を含める</span>
            <span className="text-[10px] text-slate-500">容量大</span>
          </label>

          <label className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-700/50 cursor-pointer">
            <input
              type="checkbox"
              checked={includeChatHistory}
              onChange={(e) => setIncludeChatHistory(e.target.checked)}
              className="w-4 h-4 accent-green-500"
            />
            <MessageSquare size={16} className="text-slate-400" />
            <span className="text-xs text-slate-300 flex-1">チャット履歴</span>
          </label>

          <label className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-700/50 cursor-pointer">
            <input
              type="checkbox"
              checked={includeCostHistory}
              onChange={(e) => setIncludeCostHistory(e.target.checked)}
              className="w-4 h-4 accent-green-500"
            />
            <DollarSign size={16} className="text-slate-400" />
            <span className="text-xs text-slate-300 flex-1">コスト履歴</span>
          </label>
        </div>

        {/* サイズ見積もり */}
        {estimatedSize !== null && (
          <div className="text-xs text-slate-500 mb-3">
            推定サイズ: <span className="text-slate-300 font-bold">{estimatedSize.toFixed(2)} MB</span>
          </div>
        )}

        {/* エクスポートボタン */}
        <button
          onClick={handleExport}
          disabled={isExporting || dataStats.stock === 0}
          className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all ${
            exportSuccess
              ? 'bg-green-500 text-white'
              : 'bg-green-600 hover:bg-green-500 text-white disabled:bg-slate-700 disabled:text-slate-500'
          }`}
        >
          {isExporting ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              エクスポート中...
            </>
          ) : exportSuccess ? (
            <>
              <CheckCircle size={18} />
              ダウンロード完了
            </>
          ) : (
            <>
              <FileJson size={18} />
              JSONをダウンロード
            </>
          )}
        </button>
      </div>

      {/* インポート */}
      <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700">
        <div className="flex items-center gap-2 mb-4">
          <Upload size={18} className="text-blue-500" />
          <h3 className="text-sm font-bold text-white">データインポート</h3>
        </div>

        <p className="text-xs text-slate-400 mb-4">
          エクスポートしたJSONファイルからデータを復元します。
        </p>

        {/* ファイル選択 */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileSelect}
          className="hidden"
        />

        {!importFile ? (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full border-2 border-dashed border-slate-600 rounded-xl p-6 text-center hover:border-blue-500 hover:bg-slate-700/30 transition-all"
          >
            <FileJson size={32} className="mx-auto text-slate-500 mb-2" />
            <span className="text-sm text-slate-400">JSONファイルを選択</span>
          </button>
        ) : (
          <div className="space-y-3">
            {/* プレビュー */}
            {importPreview && (
              <div className={`rounded-xl p-3 ${importPreview.valid ? 'bg-blue-500/10 border border-blue-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
                {importPreview.valid ? (
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle size={16} className="text-blue-400" />
                      <span className="text-xs font-bold text-blue-400">有効なバックアップファイル</span>
                    </div>
                    <div className="text-xs text-slate-400 space-y-1">
                      <div>案件: <span className="text-white">{importPreview.stockCount}件</span></div>
                      <div>車両: <span className="text-white">{importPreview.vehiclesCount}件</span></div>
                      <div>画像: <span className="text-white">{importPreview.hasImages ? 'あり' : 'なし'}</span></div>
                      {importPreview.exportedAt && (
                        <div>エクスポート日時: <span className="text-white">{new Date(importPreview.exportedAt).toLocaleString('ja-JP')}</span></div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    <AlertCircle size={16} className="text-red-400" />
                    <span className="text-xs text-red-400">{importPreview.error}</span>
                  </div>
                )}
              </div>
            )}

            {/* マージ戦略 */}
            {importPreview?.valid && (
              <div>
                <span className="text-xs text-slate-400 block mb-2">重複データの扱い:</span>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 'merge', label: '上書き' },
                    { value: 'skip', label: 'スキップ' },
                    { value: 'replace', label: '全置換' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setMergeStrategy(opt.value as typeof mergeStrategy)}
                      className={`py-2 rounded-lg text-xs font-bold transition-all ${
                        mergeStrategy === opt.value
                          ? 'bg-blue-500 text-white'
                          : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-500 mt-2">
                  {mergeStrategy === 'merge' && '同じIDのデータは新しい方で上書きします'}
                  {mergeStrategy === 'skip' && '同じIDのデータがあればインポートをスキップします'}
                  {mergeStrategy === 'replace' && '既存データをすべて削除して入れ替えます'}
                </p>
              </div>
            )}

            {/* インポート結果 */}
            {importResult && (
              <div className={`rounded-xl p-3 ${importResult.success ? 'bg-green-500/10 border border-green-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
                {importResult.success ? (
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle size={16} className="text-green-400" />
                      <span className="text-xs font-bold text-green-400">インポート完了</span>
                    </div>
                    <div className="text-xs text-slate-400">
                      案件 {importResult.stockImported}件、車両 {importResult.vehiclesImported}件をインポートしました
                    </div>
                    {onDataChanged && (
                      <div className="text-xs text-green-300 mt-2">
                        データリストが更新されました
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle size={16} className="text-red-400" />
                      <span className="text-xs font-bold text-red-400">インポート失敗</span>
                    </div>
                    {importResult.errors.map((err, i) => (
                      <div key={i} className="text-xs text-red-300">{err}</div>
                    ))}
                  </>
                )}
              </div>
            )}

            {/* ボタン */}
            <div className="flex gap-2">
              <button
                onClick={resetImport}
                className="flex-1 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-bold transition-all"
              >
                キャンセル
              </button>
              {importPreview?.valid && !importResult && (
                <button
                  onClick={handleImport}
                  disabled={isImporting}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-all disabled:bg-slate-700"
                >
                  {isImporting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      インポート中...
                    </>
                  ) : (
                    'インポート実行'
                  )}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DataExportSettings;
