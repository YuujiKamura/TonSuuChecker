import React, { useState, useEffect } from 'react';
import { X, Cloud, CloudOff, RefreshCw, Copy, ExternalLink, Image } from 'lucide-react';
import { getGasUrl, setGasUrl, clearGasUrl, fetchFromSheet, generateShareUrl, TaggedRecord, createSyncRecord, syncRecordToSheet } from '../services/sheetSync';
import { getStockItems } from '../services/stockService';
import { StockItem } from '../types';

interface SyncSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  onDataFetched?: (items: TaggedRecord[]) => void;
}

// 新しいGASコードはgas/TonCheckerSync.gsを参照
const GAS_CODE = `// トン数チェッカー スプレッドシート同期 GAS
// 詳細: gas/TonCheckerSync.gs

const CONFIG = {
  SHEET_NAME: 'データ',
  IMAGE_FOLDER_NAME: 'TonChecker_Images',
  HEADERS: ['日時','ID','ナンバー','車番','メモ','実測(t)','最大積載(t)','AI推定(t)','AI推定最大(t)','体積(m³)','車両タイプ','積載物','画像','画像URL','ユーザー']
};

function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  if (data.action === 'addRecord') {
    const result = addRecord(data.record);
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService.createTextOutput(JSON.stringify({ error: 'Unknown action' })).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const data = getAllRecords();
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function addRecord(record) {
  const sheet = getOrCreateSheet();
  let imageUrl = '';
  if (record.imageBase64) {
    imageUrl = saveImageToDrive(record.imageBase64, record.id);
  }
  const date = new Date(record.timestamp);
  const dateStr = Utilities.formatDate(date, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');
  const rowData = [dateStr, record.id, record.licensePlate||'', record.licenseNumber||'', record.memo||'', record.actualTonnage||'', record.maxCapacity||'', record.estimatedTonnage||'', record.estimatedMaxCapacity||'', record.estimatedVolumeM3||'', record.truckType||'', record.materialType||'', imageUrl ? \`=IMAGE("\${imageUrl}")\` : '', imageUrl, record.userName||''];
  const existingRow = findRowById(sheet, record.id);
  if (existingRow > 0) {
    sheet.getRange(existingRow, 1, 1, rowData.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }
  sheet.setRowHeight(existingRow > 0 ? existingRow : sheet.getLastRow(), 80);
  return { success: true, imageUrl, row: existingRow > 0 ? existingRow : sheet.getLastRow() };
}

function saveImageToDrive(base64Data, id) {
  const folder = getOrCreateFolder();
  const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), 'image/jpeg', id+'.jpg');
  const existingFiles = folder.getFilesByName(id+'.jpg');
  while (existingFiles.hasNext()) existingFiles.next().setTrashed(true);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return 'https://drive.google.com/uc?id='+file.getId();
}

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
    sheet.getRange(1, 1, 1, CONFIG.HEADERS.length).setValues([CONFIG.HEADERS]);
    sheet.getRange(1, 1, 1, CONFIG.HEADERS.length).setBackground('#4a5568').setFontColor('#ffffff').setFontWeight('bold');
    sheet.setColumnWidth(1, 140); sheet.setColumnWidth(13, 120); sheet.setColumnWidth(14, 200);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getOrCreateFolder() {
  const folders = DriveApp.getFoldersByName(CONFIG.IMAGE_FOLDER_NAME);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(CONFIG.IMAGE_FOLDER_NAME);
}

function findRowById(sheet, id) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) if (data[i][1] === id) return i + 1;
  return -1;
}

function getAllRecords() {
  const sheet = getOrCreateSheet();
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { records: [] };
  const headers = data[0], records = [];
  for (let i = 1; i < data.length; i++) {
    const record = {};
    headers.forEach((h, j) => record[h] = data[i][j]);
    records.push(record);
  }
  return { version: '2.0', syncDate: new Date().toISOString(), records };
}`;

const SyncSettings: React.FC<SyncSettingsProps> = ({ isOpen, onClose, onDataFetched }) => {
  const [gasUrl, setGasUrlState] = useState('');
  const [userName, setUserName] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');
  const [showAdminGuide, setShowAdminGuide] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareUrlCopied, setShareUrlCopied] = useState(false);

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
    const stockItems = getStockItems() as StockItem[];

    if (stockItems.length === 0) {
      setMessage('送信するデータがありません');
      setSyncing(false);
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < stockItems.length; i++) {
      setMessage(`送信中... (${i + 1}/${stockItems.length})`);
      const record = createSyncRecord(stockItems[i], true); // 画像含む
      const result = await syncRecordToSheet(record);
      if (result.success) {
        successCount++;
      } else {
        errorCount++;
      }
    }

    if (errorCount > 0) {
      setMessage(`${successCount}件成功, ${errorCount}件失敗`);
    } else {
      setMessage(`${successCount}件を送信完了（画像含む）`);
    }
    setSyncing(false);
    setTimeout(() => setMessage(''), 5000);
  };

  const copyGasCode = () => {
    navigator.clipboard.writeText(GAS_CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyShareUrl = () => {
    const url = generateShareUrl();
    if (url) {
      navigator.clipboard.writeText(url);
      setShareUrlCopied(true);
      setTimeout(() => setShareUrlCopied(false), 2000);
    }
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
            <div className="space-y-3 pt-2">
              <div className="flex gap-3">
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
                  <Image size={18} />
                  送信
                </button>
                <button
                  onClick={handleDisconnect}
                  className="px-4 bg-slate-700 hover:bg-slate-600 text-slate-300 font-bold py-3 rounded-xl transition-all"
                >
                  切断
                </button>
              </div>

              {/* 共有URL生成ボタン */}
              <button
                onClick={copyShareUrl}
                className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 rounded-xl transition-all"
              >
                <Copy size={18} />
                {shareUrlCopied ? '共有URLをコピーしました！' : '共有URLを生成してコピー'}
              </button>
              <p className="text-xs text-slate-500 text-center">
                このURLを他のメンバーに共有すると、開くだけで自動接続されます
              </p>
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

              <button
                onClick={copyGasCode}
                className="w-full flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-xl transition-all"
              >
                <Copy size={18} />
                {copied ? 'コピーしました！' : 'GASコードをコピー'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SyncSettings;
