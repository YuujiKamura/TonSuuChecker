
import React, { useState, useEffect } from 'react';
import { EstimationResult, ChatMessage } from '../types';
import { Save, Check, ChevronDown, ChevronUp } from 'lucide-react';
import AIChatSection from './AIChatSection';
import * as chatService from '../services/chatService';

interface AnalysisResultProps {
  result: EstimationResult;
  imageUrls: string[];
  base64Images: string[];
  analysisId: string;
  actualTonnage?: number;
  initialChatHistory?: ChatMessage[];
  onSaveActualTonnage: (value: number) => void;
  onUpdateLicensePlate: (plate: string, number: string) => void;
  onUpdateChatHistory?: (messages: ChatMessage[]) => void;
  onReanalyzeWithFeedback?: (chatHistory: ChatMessage[]) => void;
}

const AnalysisResult: React.FC<AnalysisResultProps> = ({
  result, imageUrls, base64Images, analysisId, actualTonnage, initialChatHistory,
  onSaveActualTonnage, onUpdateLicensePlate, onUpdateChatHistory, onReanalyzeWithFeedback
}) => {
  const [inputValue, setInputValue] = useState(actualTonnage?.toString() || '');
  const [isSaved, setIsSaved] = useState(!!actualTonnage);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [showDetails, setShowDetails] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (analysisId) {
      if (initialChatHistory?.length) {
        setChatMessages(initialChatHistory);
      } else {
        chatService.loadChatHistory(analysisId).then(messages => {
          setChatMessages(messages);
        });
      }
    }
  }, [analysisId, initialChatHistory]);

  const handleUpdateMessages = (messages: ChatMessage[]) => {
    setChatMessages(messages);
    if (analysisId) {
      chatService.saveChatHistory(analysisId, messages);
    }
    onUpdateChatHistory?.(messages);
  };

  const handleSave = () => {
    const val = parseFloat(inputValue);
    if (!isNaN(val)) {
      onSaveActualTonnage(val);
      setIsSaved(true);
    }
  };

  const errorRate = actualTonnage
    ? ((result.estimatedTonnage - actualTonnage) / actualTonnage) * 100
    : null;

  // フルスクリーン表示
  if (isFullscreen) {
    return (
      <div
        className="fixed inset-0 z-50 bg-black flex flex-col cursor-pointer"
        onClick={() => setIsFullscreen(false)}
      >
        {/* 画像（画面いっぱい） */}
        <div className="flex-1 relative">
          {imageUrls[0] && (
            <img src={imageUrls[0]} className="w-full h-full object-contain" />
          )}
        </div>
        {/* 結果バー（下部） */}
        <div className="bg-black/90 p-4 flex items-center justify-center gap-6">
          <div className="flex items-baseline gap-1">
            <span className="text-xs text-slate-400 font-bold">AI</span>
            <span className="text-4xl font-black text-yellow-500">{result.estimatedTonnage.toFixed(1)}</span>
            <span className="text-lg font-bold text-slate-400">t</span>
          </div>
          {actualTonnage && (
            <>
              <div className="w-px h-8 bg-slate-600" />
              <div className="flex items-baseline gap-1">
                <span className="text-xs text-slate-400 font-bold">実測</span>
                <span className="text-7xl font-black text-green-400">{actualTonnage.toFixed(1)}</span>
                <span className="text-2xl font-bold text-slate-400">t</span>
              </div>
              {errorRate !== null && (
                <div className={`px-3 py-1 rounded text-sm font-black ${Math.abs(errorRate) < 5 ? 'bg-green-500' : Math.abs(errorRate) < 15 ? 'bg-yellow-500' : 'bg-red-500'} text-white`}>
                  {errorRate > 0 ? '+' : ''}{errorRate.toFixed(0)}%
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-2 sm:p-4 space-y-2 pb-24">
      {/* ===== メインカード ===== */}
      <div className="bg-slate-900 rounded-xl overflow-hidden shadow-xl border border-slate-800">
        {/* 写真（タップでフルスクリーン） */}
        {imageUrls.map((url, i) => (
          <img
            key={i}
            src={url}
            className="w-full aspect-video object-cover cursor-pointer active:opacity-80"
            onClick={() => setIsFullscreen(true)}
          />
        ))}

        {/* 推定値と実測値 */}
        <div className="p-3 flex items-center gap-3">
          {/* AI推定 */}
          <div className="flex items-baseline gap-0.5">
            <span className="text-[10px] text-slate-500 font-bold mr-1">AI</span>
            <span className="text-3xl font-black text-yellow-500">{result.estimatedTonnage.toFixed(1)}</span>
            <span className="text-sm font-bold text-slate-500">t</span>
          </div>

          {/* 誤差 */}
          {errorRate !== null && (
            <div className={`px-2 py-0.5 rounded text-xs font-black ${Math.abs(errorRate) < 5 ? 'bg-green-500' : Math.abs(errorRate) < 15 ? 'bg-yellow-500' : 'bg-red-500'} text-white`}>
              {errorRate > 0 ? '+' : ''}{errorRate.toFixed(0)}%
            </div>
          )}

          {/* 実測値入力 */}
          <div className="flex-1 flex items-center gap-1">
            <span className="text-xs text-slate-500 font-bold">実測</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={inputValue}
              onChange={(e) => { setInputValue(e.target.value); setIsSaved(false); }}
              placeholder="0.0"
              className={`w-28 h-12 px-2 rounded font-bold text-3xl outline-none ${
                isSaved ? 'bg-green-500/20 text-green-400 border border-green-500/50' : 'bg-slate-800 text-white border border-slate-700'
              }`}
            />
            <span className="text-slate-500 text-lg font-bold">t</span>
            <button
              onClick={handleSave}
              disabled={isSaved || !inputValue}
              className={`w-8 h-8 rounded flex items-center justify-center ${
                isSaved ? "bg-green-500 text-white" : "bg-blue-600 text-white disabled:bg-slate-700 disabled:text-slate-500"
              }`}
            >
              {isSaved ? <Check size={14} /> : <Save size={14} />}
            </button>
          </div>
        </div>
      </div>

      {/* ===== 詳細情報（折りたたみ） ===== */}
      <div className="bg-slate-800 rounded-lg overflow-hidden border border-slate-700">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="w-full px-3 py-2 flex items-center justify-between text-slate-300 hover:bg-slate-700/50"
        >
          <span className="text-xs font-bold">解析詳細</span>
          {showDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {showDetails && (
          <div className="px-3 pb-3 space-y-3 text-sm">
            <div>
              <p className="text-[10px] font-bold text-slate-500 mb-1">判断理由</p>
              <p className="text-slate-300 text-xs leading-relaxed">{result.reasoning}</p>
            </div>
            {result.maxCapacityReasoning && (
              <div>
                <p className="text-[10px] font-bold text-purple-400 mb-1">最大積載量の根拠</p>
                <p className="text-slate-300 text-xs">{result.maxCapacityReasoning}</p>
              </div>
            )}
            <div>
              <p className="text-[10px] font-bold text-slate-500 mb-1">材質構成</p>
              <div className="flex flex-wrap gap-2">
                {result.materialBreakdown.map((item, index) => (
                  <span key={index} className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-300">
                    {item.material} {item.percentage}%
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ===== AIに質問 ===== */}
      <AIChatSection
        key={analysisId}
        result={result}
        base64Images={base64Images}
        chatMessages={chatMessages}
        onUpdateMessages={handleUpdateMessages}
        onReanalyzeWithFeedback={onReanalyzeWithFeedback}
      />
    </div>
  );
};

export default AnalysisResult;
