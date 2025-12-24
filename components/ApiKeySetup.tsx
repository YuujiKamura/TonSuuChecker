import React, { useState } from 'react';
import { ExternalLink, Key, Truck } from 'lucide-react';

interface ApiKeySetupProps {
  onComplete: (apiKey: string, isGoogleAIStudio: boolean) => void;
  onCancel: () => void;
}

const ApiKeySetup: React.FC<ApiKeySetupProps> = ({ onComplete, onCancel }) => {
  const [apiKey, setApiKey] = useState('');

  const handleSubmit = () => {
    if (apiKey.trim()) {
      onComplete(apiKey.trim(), true); // 常に無料枠扱い
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[130] flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-md p-6 space-y-6">
        {/* ヘッダー */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-yellow-500/20 rounded-full mb-4">
            <Truck size={32} className="text-yellow-500" />
          </div>
          <h2 className="text-xl font-black text-white mb-2">はじめに設定が必要です</h2>
          <p className="text-sm text-slate-400">
            このアプリはトラックの荷姿を撮影してAIが積載量を推定します。
            利用にはGoogle AIのキーが必要です（無料）。
          </p>
        </div>

        {/* ステップ1: キーを取得 */}
        <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-6 h-6 bg-blue-500 text-white text-xs font-bold rounded-full flex items-center justify-center">1</span>
            <span className="text-sm font-bold text-white">キーを取得する</span>
          </div>
          <p className="text-xs text-slate-400 mb-3">
            下のボタンからGoogle AI Studioを開き、「キーを作成」してコピーしてください。
          </p>
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-all"
          >
            Google AI Studioを開く <ExternalLink size={16} />
          </a>
        </div>

        {/* ステップ2: キーを貼り付け */}
        <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-6 h-6 bg-blue-500 text-white text-xs font-bold rounded-full flex items-center justify-center">2</span>
            <span className="text-sm font-bold text-white">コピーしたキーを貼り付け</span>
          </div>
          <div className="flex items-center gap-2">
            <Key size={18} className="text-slate-500 shrink-0" />
            <input
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIza..."
              className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm"
            />
          </div>
        </div>

        {/* ボタン */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 font-bold py-3 rounded-xl transition-all"
          >
            キャンセル
          </button>
          <button
            onClick={handleSubmit}
            disabled={!apiKey.trim()}
            className="flex-1 bg-yellow-500 hover:bg-yellow-400 disabled:bg-slate-700 disabled:text-slate-500 text-black font-bold py-3 rounded-xl transition-all"
          >
            設定完了
          </button>
        </div>
      </div>
    </div>
  );
};

export default ApiKeySetup;
