import React, { useState, useEffect } from 'react';
import { X, Key, Cloud, Truck, Cpu, Gauge, Zap, BrainCircuit, ExternalLink } from 'lucide-react';
import { getApiKey, setApiKey, clearApiKey, isGoogleAIStudioKey } from '../services/geminiService';
import SyncSettings from './SyncSettings';
import ReferenceImageSettings from './ReferenceImageSettings';

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
  selectedModel: 'gemini-3-flash-preview' | 'gemini-3-pro-preview';
  onModelChange: (model: 'gemini-3-flash-preview' | 'gemini-3-pro-preview') => void;
  ensembleTarget: number;
  onEnsembleChange: (value: number) => void;
  onApiKeyChange: (hasKey: boolean, isGoogleAIStudio: boolean) => void;
}

const Settings: React.FC<SettingsProps> = ({
  isOpen,
  onClose,
  selectedModel,
  onModelChange,
  ensembleTarget,
  onEnsembleChange,
  onApiKeyChange,
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'sync' | 'vehicles'>('general');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [isGoogleAIStudio, setIsGoogleAIStudio] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const existingKey = getApiKey();
      setHasApiKey(!!existingKey);
      if (existingKey) {
        setApiKeyInput(existingKey);
        setIsGoogleAIStudio(isGoogleAIStudioKey());
      } else {
        setApiKeyInput('');
        setIsGoogleAIStudio(false);
      }
    }
  }, [isOpen]);

  const handleSaveApiKey = () => {
    if (apiKeyInput.trim()) {
      setApiKey(apiKeyInput.trim(), isGoogleAIStudio);
      setHasApiKey(true);
      onApiKeyChange(true, isGoogleAIStudio);
    }
  };

  const handleClearApiKey = () => {
    clearApiKey();
    setHasApiKey(false);
    setApiKeyInput('');
    setIsGoogleAIStudio(false);
    onApiKeyChange(false, false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-lg max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
        {/* ヘッダー */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <h2 className="text-lg font-black text-white">設定</h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* タブ */}
        <div className="flex border-b border-slate-800">
          <button
            onClick={() => setActiveTab('general')}
            className={`flex-1 py-3 text-sm font-bold transition-colors ${activeTab === 'general' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-400 hover:text-white'}`}
          >
            基本設定
          </button>
          <button
            onClick={() => setActiveTab('sync')}
            className={`flex-1 py-3 text-sm font-bold transition-colors ${activeTab === 'sync' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-400 hover:text-white'}`}
          >
            <Cloud size={14} className="inline mr-1" />
            同期
          </button>
          <button
            onClick={() => setActiveTab('vehicles')}
            className={`flex-1 py-3 text-sm font-bold transition-colors ${activeTab === 'vehicles' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-400 hover:text-white'}`}
          >
            <Truck size={14} className="inline mr-1" />
            車両
          </button>
        </div>

        {/* コンテンツ */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'general' && (
            <div className="space-y-6">
              {/* APIキー設定 */}
              <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700">
                <div className="flex items-center gap-2 mb-4">
                  <Key size={18} className="text-yellow-500" />
                  <h3 className="text-sm font-bold text-white">AIキー設定</h3>
                  {hasApiKey && (
                    <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">設定済み</span>
                  )}
                </div>

                {/* ステップ1: キーを取得 */}
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-5 h-5 bg-blue-500 text-white text-xs font-bold rounded-full flex items-center justify-center shrink-0">1</span>
                    <span className="text-xs font-bold text-slate-300">キーを取得（無料）</span>
                  </div>
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold py-2.5 rounded-xl transition-all"
                  >
                    Google AI Studioを開く <ExternalLink size={14} />
                  </a>
                </div>

                {/* ステップ2: キーを貼り付け */}
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-5 h-5 bg-blue-500 text-white text-xs font-bold rounded-full flex items-center justify-center shrink-0">2</span>
                    <span className="text-xs font-bold text-slate-300">コピーしたキーを貼り付け</span>
                  </div>
                  <input
                    type="text"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="AIza..."
                    className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm"
                  />
                </div>

                {/* 無料枠チェック */}
                <label className="flex items-center gap-3 mb-4 p-3 bg-green-500/10 rounded-xl border border-green-500/30 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isGoogleAIStudio}
                    onChange={(e) => setIsGoogleAIStudio(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-green-500"
                  />
                  <div className="flex-1">
                    <span className="text-sm font-bold text-green-400">無料枠を使用</span>
                    <p className="text-xs text-slate-400">Google AI Studioは無料で利用可</p>
                  </div>
                </label>

                <div className="flex gap-2">
                  <button
                    onClick={handleSaveApiKey}
                    disabled={!apiKeyInput.trim()}
                    className="flex-1 bg-yellow-500 hover:bg-yellow-400 disabled:bg-slate-700 disabled:text-slate-500 text-black text-sm font-bold py-2.5 rounded-xl transition-all"
                  >
                    保存
                  </button>
                  {hasApiKey && (
                    <button
                      onClick={handleClearApiKey}
                      className="px-4 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-sm font-bold py-2.5 rounded-xl transition-all"
                    >
                      削除
                    </button>
                  )}
                </div>
              </div>

              {/* 解析エンジン */}
              <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700">
                <div className="flex items-center gap-2 mb-3">
                  <Cpu size={18} className="text-yellow-500" />
                  <h3 className="text-sm font-bold text-white">解析エンジン</h3>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => { onModelChange('gemini-3-flash-preview'); localStorage.setItem('tonchecker_model', 'gemini-3-flash-preview'); }}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${selectedModel.includes('flash') ? 'bg-yellow-500/10 border-yellow-500/50 text-yellow-500' : 'bg-slate-900 border-slate-700 text-slate-500 hover:border-slate-600'}`}
                  >
                    <Zap size={24} />
                    <span className="text-xs font-black uppercase">Flash</span>
                    <span className="text-[10px] text-slate-500">高速・低コスト</span>
                  </button>
                  <button
                    onClick={() => { onModelChange('gemini-3-pro-preview'); localStorage.setItem('tonchecker_model', 'gemini-3-pro-preview'); }}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${selectedModel.includes('pro') ? 'bg-blue-500/10 border-blue-500/50 text-blue-400' : 'bg-slate-900 border-slate-700 text-slate-500 hover:border-slate-600'}`}
                  >
                    <BrainCircuit size={24} />
                    <span className="text-xs font-black uppercase">Pro</span>
                    <span className="text-[10px] text-slate-500">高精度</span>
                  </button>
                </div>
              </div>

              {/* 推論の深さ */}
              <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700">
                <div className="flex items-center gap-2 mb-3">
                  <Gauge size={18} className="text-blue-500" />
                  <h3 className="text-sm font-bold text-white">推論の深さ</h3>
                  <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">x{ensembleTarget}</span>
                </div>
                <input
                  type="range" min="1" max="5" step="1"
                  value={ensembleTarget}
                  onChange={(e) => { const v = parseInt(e.target.value); onEnsembleChange(v); localStorage.setItem('tonchecker_ensemble_target', v.toString()); }}
                  className="w-full accent-blue-500 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer mb-2"
                />
                <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase">
                  <span>高速</span>
                  <span>推奨</span>
                  <span>最大精度</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'sync' && (
            <SyncSettings isOpen={true} onClose={() => {}} embedded={true} />
          )}

          {activeTab === 'vehicles' && (
            <ReferenceImageSettings isOpen={true} onClose={() => {}} embedded={true} />
          )}
        </div>
      </div>
    </div>
  );
};

export default Settings;
