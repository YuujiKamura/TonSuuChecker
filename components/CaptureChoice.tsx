import React, { useState } from 'react';
import { Brain, Archive, X, Scale, Trash2, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { SYSTEM_PROMPT, LOAD_GRADES_PROMPT } from '../prompts/weightEstimation';

type AnalysisMode = 'multi-param' | 'box-overlay';

interface CaptureChoiceProps {
  imageUrl: string;
  onAnalyze: (maxCapacity?: number) => void;
  onStock?: () => void;  // ストックからの解析の場合は不要
  onCancel: () => void;
  initialMaxCapacity?: number;
  source?: 'capture' | 'stock';  // 解析のソース（カメラ/アップロード or ストック）
  analysisMode?: AnalysisMode;
  onAnalysisModeChange?: (mode: AnalysisMode) => void;
}

const CaptureChoice: React.FC<CaptureChoiceProps> = ({ imageUrl, onAnalyze, onStock, onCancel, initialMaxCapacity, source = 'capture', analysisMode = 'box-overlay', onAnalysisModeChange }) => {
  const [customCapacity, setCustomCapacity] = useState<string>(initialMaxCapacity ? initialMaxCapacity.toString() : '');
  const [showPrompt, setShowPrompt] = useState(false);

  const handleAnalyze = () => {
    const capacity = customCapacity && !isNaN(parseFloat(customCapacity)) ? parseFloat(customCapacity) : undefined;
    onAnalyze(capacity);
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 overflow-y-auto">
      <div className="min-h-full flex flex-col p-4">
        {/* 閉じるボタン */}
        <div className="flex justify-end mb-2">
          <button
            onClick={onCancel}
            className="p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {/* 画像エリア */}
        <div className="flex-shrink-0 mb-4">
          <img
            src={imageUrl}
            className="w-full max-h-[35vh] object-contain rounded-2xl border-2 border-slate-700"
            alt="Captured"
          />
        </div>

        {/* 選択肢エリア */}
        <div className="flex-1 space-y-4">
          {/* 最大積載量入力 */}
          <div className="bg-slate-900/50 rounded-xl p-3 border border-slate-700">
            <div className="flex items-center gap-2 mb-2">
              <Scale size={14} className="text-green-500" />
              <span className="text-xs font-bold text-slate-400">最大積載量（任意）</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                placeholder="例: 7.5"
                value={customCapacity}
                onChange={(e) => setCustomCapacity(e.target.value)}
                className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-center text-sm font-bold focus:outline-none focus:border-green-500"
              />
              <span className="text-slate-400 text-sm font-bold">t</span>
              {customCapacity && (
                <button
                  onClick={() => setCustomCapacity('')}
                  className="px-2 py-2 bg-slate-700 hover:bg-slate-600 text-slate-400 rounded-lg text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* 解析方式切替 */}
          {onAnalysisModeChange && (
            <div className="bg-slate-900/50 rounded-xl p-3 border border-slate-700">
              <div className="flex items-center gap-2 mb-2">
                <Brain size={14} className="text-blue-500" />
                <span className="text-xs font-bold text-slate-400">解析方式</span>
              </div>
              <div className="flex rounded-lg overflow-hidden border border-slate-600">
                <button
                  onClick={() => onAnalysisModeChange('box-overlay')}
                  className={`flex-1 px-3 py-2 text-xs font-bold transition-all ${
                    analysisMode === 'box-overlay'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  幾何学方式
                </button>
                <button
                  onClick={() => onAnalysisModeChange('multi-param')}
                  className={`flex-1 px-3 py-2 text-xs font-bold transition-all ${
                    analysisMode === 'multi-param'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  従来方式
                </button>
              </div>
            </div>
          )}

          {/* アクションボタン */}
          <div className="flex gap-4 justify-center">
            <button
              onClick={handleAnalyze}
              className="flex flex-col items-center gap-2 p-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-all active:scale-95"
            >
              <Brain size={28} />
              <span className="text-sm">AI解析</span>
            </button>
            {source === 'capture' && onStock && (
              <button
                onClick={onStock}
                className="flex flex-col items-center gap-2 p-4 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-bold transition-all active:scale-95 border border-slate-600"
              >
                <Archive size={28} />
                <span className="text-sm">ストック</span>
              </button>
            )}
            <button
              onClick={onCancel}
              className="flex flex-col items-center gap-2 p-4 rounded-xl bg-red-900/50 hover:bg-red-800/50 text-red-400 font-bold transition-all active:scale-95 border border-red-800/50"
            >
              <Trash2 size={28} />
              <span className="text-sm">廃棄</span>
            </button>
          </div>

          {/* プロンプト確認 */}
          <div className="mt-4 bg-slate-900/50 rounded-xl border border-slate-700 overflow-hidden">
            <button
              onClick={() => setShowPrompt(!showPrompt)}
              className="w-full px-3 py-2 flex items-center justify-between text-slate-400 hover:bg-slate-800/50"
            >
              <div className="flex items-center gap-2">
                <FileText size={14} />
                <span className="text-xs font-bold">AIプロンプト確認</span>
              </div>
              {showPrompt ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {showPrompt && (
              <div className="px-3 pb-3 space-y-3 max-h-[40vh] overflow-y-auto">
                <div>
                  <p className="text-[10px] font-bold text-blue-400 mb-1">システムプロンプト</p>
                  <pre className="text-[10px] text-slate-400 whitespace-pre-wrap bg-slate-800 p-2 rounded overflow-x-auto">{SYSTEM_PROMPT}</pre>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-green-400 mb-1">等級定義</p>
                  <pre className="text-[10px] text-slate-400 whitespace-pre-wrap bg-slate-800 p-2 rounded overflow-x-auto">{LOAD_GRADES_PROMPT}</pre>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CaptureChoice;
