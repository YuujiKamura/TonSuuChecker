import React, { useState, useEffect } from 'react';
import { X, Cloud, CloudOff, RefreshCw, Copy, ExternalLink } from 'lucide-react';
import { getGasUrl, setGasUrl, clearGasUrl, fetchFromSheet, syncToSheet, extractMetadata, TaggedRecord } from '../services/sheetSync';
import { getStockItems } from '../services/stockService';

interface SyncSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  onDataFetched?: (items: TaggedRecord[]) => void;
}

const GAS_CODE = `function doGet(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = sheet.getRange('A1').getValue();
  return ContentService.createTextOutput(data || '{"items":[]}').setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  sheet.getRange('A1').setValue(e.parameter.data);
  return ContentService.createTextOutput('{"success":true}').setMimeType(ContentService.MimeType.JSON);
}`;

const SyncSettings: React.FC<SyncSettingsProps> = ({ isOpen, onClose, onDataFetched }) => {
  const [gasUrl, setGasUrlState] = useState('');
  const [userName, setUserName] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');
  const [showAdminGuide, setShowAdminGuide] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setGasUrlState(getGasUrl() || '');
      setUserName(localStorage.getItem('tonchecker_username') || '');
      setIsConnected(!!getGasUrl());
    }
  }, [isOpen]);

  const handleSave = () => {
    if (gasUrl.trim()) {
      setGasUrl(gasUrl.trim());
      setIsConnected(true);
      setMessage('接続しました');
    }
    if (userName.trim()) {
      localStorage.setItem('tonchecker_username', userName.trim());
    }
    setTimeout(() => setMessage(''), 2000);
  };

  const handleDisconnect = () => {
    clearGasUrl();
    setGasUrlState('');
    setIsConnected(false);
    setMessage('切断しました');
    setTimeout(() => setMessage(''), 2000);
  };

  const handleFetch = async () => {
    setSyncing(true);
    setMessage('取得中...');
    const data = await fetchFromSheet();
    if (data && data.items) {
      setMessage(`${data.items.length}件のデータを取得`);
      onDataFetched?.(data.items);
    } else {
      setMessage('データなし or エラー');
    }
    setSyncing(false);
    setTimeout(() => setMessage(''), 3000);
  };

  const handlePush = async () => {
    setSyncing(true);
    setMessage('送信中...');
    const stockItems = getStockItems();
    const metadata = extractMetadata(stockItems);
    const success = await syncToSheet(metadata);
    setMessage(success ? `${metadata.length}件を送信` : '送信エラー');
    setSyncing(false);
    setTimeout(() => setMessage(''), 3000);
  };

  const copyGasCode = () => {
    navigator.clipboard.writeText(GAS_CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 max-w-md w-full shadow-2xl my-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-black text-white flex items-center gap-3">
            {isConnected ? <Cloud className="text-green-500" size={24} /> : <CloudOff className="text-slate-500" size={24} />}
            データ共有
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white">
            <X size={24} />
          </button>
        </div>

        {/* ユーザー向け：URLを貼るだけ */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-2">あなたの名前</label>
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="例: 田中"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-2">共有URL（管理者から受け取る）</label>
            <input
              type="text"
              value={gasUrl}
              onChange={(e) => setGasUrlState(e.target.value)}
              placeholder="https://script.google.com/..."
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={!gasUrl.trim()}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-3 rounded-xl transition-all"
          >
            接続
          </button>

          {isConnected && (
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleFetch}
                disabled={syncing}
                className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 disabled:bg-slate-700 text-white font-bold py-3 rounded-xl transition-all"
              >
                <RefreshCw size={18} className={syncing ? 'animate-spin' : ''} />
                取得
              </button>
              <button
                onClick={handlePush}
                disabled={syncing}
                className="flex-1 flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 text-white font-bold py-3 rounded-xl transition-all"
              >
                <Cloud size={18} />
                送信
              </button>
              <button
                onClick={handleDisconnect}
                className="px-4 bg-slate-700 hover:bg-slate-600 text-slate-300 font-bold py-3 rounded-xl transition-all"
              >
                切断
              </button>
            </div>
          )}

          {message && (
            <p className="text-center text-sm text-green-400 py-2">{message}</p>
          )}
        </div>

        {/* 管理者向けガイド（折りたたみ） */}
        <div className="mt-6 border-t border-slate-700 pt-4">
          <button
            onClick={() => setShowAdminGuide(!showAdminGuide)}
            className="w-full text-left text-sm text-slate-500 hover:text-slate-300 flex items-center justify-between"
          >
            <span>管理者向け：共有URLの作成方法</span>
            <span>{showAdminGuide ? '▼' : '▶'}</span>
          </button>

          {showAdminGuide && (
            <div className="mt-4 space-y-4">
              <div className="p-4 bg-slate-800 rounded-xl text-sm text-slate-400">
                <p className="font-bold text-white mb-3">手順:</p>
                <ol className="list-decimal list-inside space-y-2">
                  <li>
                    <a
                      href="https://sheets.new"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline inline-flex items-center gap-1"
                    >
                      新しいスプレッドシートを作成 <ExternalLink size={12} />
                    </a>
                  </li>
                  <li>メニュー「拡張機能」→「Apps Script」</li>
                  <li>下のコードをコピーして貼り付け</li>
                  <li>「デプロイ」→「新しいデプロイ」</li>
                  <li>種類「ウェブアプリ」を選択</li>
                  <li>アクセス「全員」に設定してデプロイ</li>
                  <li>表示されたURLを関係者に共有</li>
                </ol>
              </div>

              <div className="relative">
                <pre className="p-3 bg-slate-950 rounded-xl text-xs text-green-400 overflow-x-auto whitespace-pre-wrap">
                  {GAS_CODE}
                </pre>
                <button
                  onClick={copyGasCode}
                  className="absolute top-2 right-2 p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-all"
                >
                  {copied ? '✓' : <Copy size={16} />}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SyncSettings;
