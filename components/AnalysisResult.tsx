
import React, { useState, useEffect } from 'react';
import { EstimationResult, ChatMessage } from '../types';
import { Truck, Layers, Info, CheckCircle2, Save, Scale, Edit2, Check, ChevronDown, ChevronUp } from 'lucide-react';
import AIChatSection from './AIChatSection';

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

const CHAT_STORAGE_KEY = 'garaton_chat_history';

const saveChatHistory = (analysisId: string, messages: ChatMessage[]) => {
  try {
    const allChats = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) || '{}');
    allChats[analysisId] = messages;
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(allChats));
  } catch (e) {
    console.error('Failed to save chat history', e);
  }
};

const loadChatHistory = (analysisId: string): ChatMessage[] => {
  try {
    const allChats = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) || '{}');
    return allChats[analysisId] || [];
  } catch (e) {
    console.error('Failed to load chat history', e);
    return [];
  }
};

const COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6'];

const AnalysisResult: React.FC<AnalysisResultProps> = ({
  result, imageUrls, base64Images, analysisId, actualTonnage, initialChatHistory,
  onSaveActualTonnage, onUpdateLicensePlate, onUpdateChatHistory, onReanalyzeWithFeedback
}) => {
  const [inputValue, setInputValue] = useState(actualTonnage?.toString() || '');
  const [isSaved, setIsSaved] = useState(!!actualTonnage);
  const [isEditingPlate, setIsEditingPlate] = useState(false);
  const [tempNumber, setTempNumber] = useState(result.licenseNumber || '');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (analysisId) {
      const messages = initialChatHistory?.length ? initialChatHistory : loadChatHistory(analysisId);
      setChatMessages(messages);
    }
  }, [analysisId, initialChatHistory]);

  const handleUpdateMessages = (messages: ChatMessage[]) => {
    setChatMessages(messages);
    if (analysisId) {
      saveChatHistory(analysisId, messages);
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

  const handlePlateSave = () => {
    onUpdateLicensePlate('', tempNumber);
    setIsEditingPlate(false);
  };

  const errorRate = actualTonnage
    ? ((result.estimatedTonnage - actualTonnage) / actualTonnage) * 100
    : null;

  return (
    <div className="max-w-4xl mx-auto p-2 sm:p-4 space-y-3 pb-24">
      {/* ===== メインカード（共有用サマリー） ===== */}
      <div className="bg-slate-900 rounded-2xl overflow-hidden shadow-xl border border-slate-800">
        {/* 写真 */}
        <div className="relative">
          {imageUrls.map((url, i) => (
            <img key={i} src={url} className="w-full aspect-video object-cover" />
          ))}
          {/* ナンバー（写真の上に重ねる） */}
          <div className="absolute top-2 right-2">
            {isEditingPlate ? (
              <div className="flex items-center gap-1 bg-black/80 backdrop-blur p-1.5 rounded-lg">
                <input
                  type="text"
                  value={tempNumber}
                  onChange={(e) => setTempNumber(e.target.value)}
                  className="text-sm font-bold bg-white rounded px-2 py-1 w-24 outline-none"
                  autoFocus
                />
                <button onClick={handlePlateSave} className="bg-blue-500 text-white px-2 py-1 rounded text-xs font-bold">OK</button>
              </div>
            ) : (
              <button
                onClick={() => setIsEditingPlate(true)}
                className="bg-black/80 backdrop-blur text-white px-3 py-1.5 rounded-lg flex items-center gap-1.5 hover:bg-black/90 transition-colors"
              >
                <span className="text-sm font-bold tracking-wider">{result.licenseNumber || '----'}</span>
                <Edit2 size={12} className="text-blue-400" />
              </button>
            )}
          </div>
        </div>

        {/* 推定値と実測値 */}
        <div className="p-4">
          <div className="flex items-center justify-between gap-4">
            {/* AI推定 */}
            <div className="flex-1">
              <p className="text-slate-500 text-[10px] font-bold uppercase mb-1">AI推定</p>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-black text-yellow-500">{result.estimatedTonnage.toFixed(1)}</span>
                <span className="text-lg font-bold text-slate-500">t</span>
              </div>
            </div>

            {/* 誤差表示 */}
            {errorRate !== null && (
              <div className={`px-3 py-1 rounded-full text-sm font-black ${Math.abs(errorRate) < 5 ? 'bg-green-500' : Math.abs(errorRate) < 15 ? 'bg-yellow-500' : 'bg-red-500'} text-white`}>
                {errorRate > 0 ? '+' : ''}{errorRate.toFixed(1)}%
              </div>
            )}

            {/* 実測値入力 */}
            <div className="flex-1">
              <p className={`text-[10px] font-bold uppercase mb-1 ${isSaved ? 'text-green-400' : 'text-blue-400'}`}>
                {isSaved ? '実測値' : '実測値を入力'}
              </p>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={inputValue}
                    onChange={(e) => { setInputValue(e.target.value); setIsSaved(false); }}
                    placeholder="0.0"
                    className={`w-full h-10 px-3 rounded-lg font-black text-xl outline-none transition-all ${
                      isSaved ? 'bg-green-500/20 text-green-400 border border-green-500/50' : 'bg-slate-800 text-white border border-slate-700 focus:border-blue-500'
                    }`}
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-sm">t</span>
                </div>
                <button
                  onClick={handleSave}
                  disabled={isSaved || !inputValue}
                  className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all active:scale-95 ${
                    isSaved ? "bg-green-500 text-white" : "bg-blue-600 hover:bg-blue-500 text-white disabled:bg-slate-700 disabled:text-slate-500"
                  }`}
                >
                  {isSaved ? <CheckCircle2 size={18} /> : <Save size={16} />}
                </button>
              </div>
            </div>
          </div>

          {/* コンパクトな車両情報 */}
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-800 text-xs">
            <span className="flex items-center gap-1 text-slate-400">
              <Truck size={14} className="text-blue-400" />
              {result.truckType}
            </span>
            <span className="flex items-center gap-1 text-slate-400">
              <Scale size={14} className="text-purple-400" />
              {result.estimatedMaxCapacity ? `${result.estimatedMaxCapacity}t積` : '-'}
            </span>
            <span className="flex items-center gap-1 text-slate-400">
              <Layers size={14} className="text-green-400" />
              {result.estimatedVolumeM3.toFixed(1)}m³
            </span>
          </div>
        </div>
      </div>

      {/* ===== 詳細情報（折りたたみ） ===== */}
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="w-full p-3 flex items-center justify-between text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <span className="flex items-center gap-2 text-sm font-bold">
            <Info size={16} className="text-blue-500" />
            解析詳細
          </span>
          {showDetails ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>

        {showDetails && (
          <div className="p-4 pt-0 space-y-4 border-t border-slate-100">
            {/* AI判断理由 */}
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase mb-2">AI判断理由</p>
              <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded-lg leading-relaxed">
                "{result.reasoning}"
              </p>
            </div>

            {/* 最大積載量の推定根拠 */}
            {result.maxCapacityReasoning && (
              <div>
                <p className="text-xs font-bold text-purple-500 uppercase mb-2">最大積載量の根拠</p>
                <p className="text-sm text-slate-600 bg-purple-50 p-3 rounded-lg">
                  {result.maxCapacityReasoning}
                </p>
              </div>
            )}

            {/* 材質構成 */}
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase mb-2">材質構成</p>
              <div className="space-y-2">
                {result.materialBreakdown.map((item, index) => (
                  <div key={index}>
                    <div className="flex justify-between text-xs font-bold text-slate-700 mb-0.5">
                      <span>{item.material}</span>
                      <span>{item.percentage}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full transition-all duration-1000"
                        style={{ width: `${item.percentage}%`, backgroundColor: COLORS[index % COLORS.length] }}
                      />
                    </div>
                  </div>
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
