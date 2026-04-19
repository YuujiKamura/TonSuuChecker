import React, { useState } from 'react';
import { ExternalLink, Key, Truck, AlertTriangle } from 'lucide-react';

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
          <div className="text-xs text-slate-400 mb-3 space-y-1.5">
            <p>下のボタンからGoogle AI Studioを開きます。</p>
            <div className="bg-slate-900/50 rounded-lg p-2 space-y-1">
              <p className="text-slate-300">① Googleアカウントでログイン</p>
              <p className="text-slate-300">②「<span className="text-blue-400 font-bold">APIキーを作成</span>」をクリック</p>
              <p className="text-slate-300">③ 表示されたキーをコピー</p>
            </div>
          </div>
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-all"
          >
            Google AI Studioを開く <ExternalLink size={16} />
          </a>
        </div>

        {/* 警告: キー作成後は必ず制限をかける */}
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4">
          <div className="flex items-start gap-2 mb-3">
            <AlertTriangle size={20} className="text-red-400 shrink-0 mt-0.5" />
            <h3 className="text-sm font-bold text-red-300">
              安全のため、キーには必ず制限をかけてください
            </h3>
          </div>
          <div className="text-xs text-slate-300 space-y-2">
            <p className="text-slate-400">
              制限なしのキーが漏洩すると、第三者に悪用され高額請求になる可能性があります。
              以下をGoogle Cloud Consoleで設定してください。
            </p>
            <div className="bg-slate-900/60 rounded-lg p-3 space-y-2">
              <div>
                <p className="text-red-200 font-bold mb-1">① アプリケーション制限: HTTPリファラー</p>
                <code className="block bg-black/40 text-yellow-300 text-[10px] px-2 py-1 rounded break-all font-mono">
                  https://yuujikamura.github.io/TonSuuChecker/*
                </code>
              </div>
              <div>
                <p className="text-red-200 font-bold mb-1">② API制限: 以下のみ許可</p>
                <code className="block bg-black/40 text-yellow-300 text-[10px] px-2 py-1 rounded font-mono">
                  Generative Language API
                </code>
              </div>
              <div>
                <p className="text-red-200 font-bold mb-1">③ 課金上限アラートの設定（推奨）</p>
                <p className="text-slate-400 text-[11px]">例: 月 $5 で通知</p>
              </div>
            </div>
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full bg-red-600/80 hover:bg-red-500 text-white font-bold py-2.5 rounded-xl transition-all text-xs"
            >
              Google Cloud Console を開く <ExternalLink size={14} />
            </a>
            <a
              href="https://qiita.com/pythonista0328/items/f9eb8b7fb6a14087df35"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full text-[11px] text-slate-400 hover:text-slate-200 underline"
            >
              参考: Qiita「APIキーの制限方法」 <ExternalLink size={11} />
            </a>
          </div>
        </div>

        {/* ステップ2: キーを貼り付け */}
        <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-6 h-6 bg-blue-500 text-white text-xs font-bold rounded-full flex items-center justify-center">2</span>
            <span className="text-sm font-bold text-white">コピーしたキーを貼り付け</span>
          </div>
          <p className="text-[10px] text-slate-500 mb-2">
            キーは <span className="text-yellow-400 font-mono">AIza...</span> で始まる39文字の文字列です
          </p>
          <div className="flex items-center gap-2">
            <Key size={18} className="text-slate-500 shrink-0" />
            <input
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIza..."
              className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm font-mono"
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
