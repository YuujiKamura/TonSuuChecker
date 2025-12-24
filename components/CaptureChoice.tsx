import React, { useState } from 'react';
import { Brain, Archive, X, Scale } from 'lucide-react';

interface CaptureChoiceProps {
  imageUrl: string;
  onAnalyze: (maxCapacity?: number) => void;
  onStock?: () => void;  // ストックからの解析の場合は不要
  onCancel: () => void;
  initialMaxCapacity?: number;
  source?: 'capture' | 'stock';  // 解析のソース（カメラ/アップロード or ストック）
}

const CaptureChoice: React.FC<CaptureChoiceProps> = ({ imageUrl, onAnalyze, onStock, onCancel, initialMaxCapacity, source = 'capture' }) => {
  const [customCapacity, setCustomCapacity] = useState<string>(initialMaxCapacity ? initialMaxCapacity.toString() : '');

  const handleAnalyze = () => {
    const capacity = customCapacity && !isNaN(parseFloat(customCapacity)) ? parseFloat(customCapacity) : undefined;
    onAnalyze(capacity);
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex flex-col">
      <div className="flex-grow flex items-center justify-center p-4">
        <div className="relative max-w-2xl w-full">
          <img
            src={imageUrl}
            className="w-full rounded-3xl border-4 border-slate-700 shadow-2xl"
            alt="Captured"
          />
          <button
            onClick={onCancel}
            className="absolute top-4 right-4 p-3 rounded-full bg-black/50 text-white hover:bg-black/70 transition-all"
          >
            <X size={24} />
          </button>
        </div>
      </div>

      <div className="p-6 pb-12 bg-slate-950/80 backdrop-blur-xl border-t border-slate-800">
        <p className="text-center text-slate-400 text-sm mb-4">この画像をどうしますか？</p>
        
        {/* 最大積載量入力 */}
        <div className="mb-6 max-w-md mx-auto">
          <div className="bg-slate-900/50 rounded-2xl p-4 border border-slate-700">
            <div className="flex items-center gap-2 mb-3">
              <Scale size={16} className="text-green-500" />
              <span className="text-xs font-bold text-slate-400 uppercase">最大積載量（任意）</span>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              車両の最大積載量がわかる場合は入力してください。推定精度が向上します。
            </p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                placeholder="例: 7.5"
                value={customCapacity}
                onChange={(e) => setCustomCapacity(e.target.value)}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white text-center font-bold focus:outline-none focus:border-green-500"
              />
              <span className="text-slate-400 text-sm font-bold">t</span>
              {customCapacity && (
                <button
                  onClick={() => setCustomCapacity('')}
                  className="px-3 py-3 bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-red-400 rounded-lg transition-all text-xs font-bold"
                >
                  クリア
                </button>
              )}
            </div>
            {customCapacity && !isNaN(parseFloat(customCapacity)) && (
              <div className="mt-2">
                <span className="text-green-400 text-xs font-bold">
                  最大積載量: {parseFloat(customCapacity)}t で解析します
                </span>
              </div>
            )}
          </div>
        </div>

        <div className={`flex flex-col sm:flex-row gap-3 sm:gap-4 max-w-md mx-auto ${source === 'stock' ? 'sm:justify-center' : ''}`}>
          <button
            onClick={handleAnalyze}
            className="flex-1 flex items-center sm:flex-col gap-4 sm:gap-3 p-4 sm:p-6 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-all active:scale-95 shadow-lg"
          >
            <Brain size={28} className="shrink-0" />
            <div className="flex flex-col sm:items-center">
              <span className="text-lg">AI解析</span>
              <span className="text-xs text-blue-200">今すぐ推定</span>
            </div>
          </button>
          {source === 'capture' && onStock && (
            <button
              onClick={onStock}
              className="flex-1 flex items-center sm:flex-col gap-4 sm:gap-3 p-4 sm:p-6 rounded-2xl bg-slate-700 hover:bg-slate-600 text-white font-bold transition-all active:scale-95 shadow-lg border border-slate-600"
            >
              <Archive size={28} className="shrink-0" />
              <div className="flex flex-col sm:items-center">
                <span className="text-lg">ストック</span>
                <span className="text-xs text-slate-400">後でタグ付け</span>
              </div>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CaptureChoice;
