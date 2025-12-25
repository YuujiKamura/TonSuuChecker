
import React, { useState, useEffect } from 'react';
import { EstimationResult, ChatMessage } from '../types';
import { Truck, Layers, Info, CheckCircle2, Save, Scale, CreditCard, Edit2, Activity, Check } from 'lucide-react';
import AIChatSection from './AIChatSection';

interface AnalysisResultProps {
  result: EstimationResult;
  imageUrls: string[];
  base64Images: string[];
  analysisId: string;
  actualTonnage?: number;
  initialChatHistory?: ChatMessage[];  // ストックから読み込んだ会話履歴
  onSaveActualTonnage: (value: number) => void;
  onUpdateLicensePlate: (plate: string, number: string) => void;
  onUpdateChatHistory?: (messages: ChatMessage[]) => void;  // 会話履歴をストックに保存
  onReanalyzeWithFeedback?: (chatHistory: ChatMessage[]) => void;  // 指摘を反映して再解析
}

// 会話履歴の保存・読み込み
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

const clearChatHistory = (analysisId: string) => {
  try {
    const allChats = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) || '{}');
    delete allChats[analysisId];
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(allChats));
  } catch (e) {
    console.error('Failed to clear chat history', e);
  }
};

const COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6'];

const AnalysisResult: React.FC<AnalysisResultProps> = ({ result, imageUrls, base64Images, analysisId, actualTonnage, initialChatHistory, onSaveActualTonnage, onUpdateLicensePlate, onUpdateChatHistory, onReanalyzeWithFeedback }) => {
  const [inputValue, setInputValue] = useState(actualTonnage?.toString() || '');
  const [isSaved, setIsSaved] = useState(!!actualTonnage);
  const [isEditingPlate, setIsEditingPlate] = useState(false);
  const [tempNumber, setTempNumber] = useState(result.licenseNumber || '');
  const [tempPlate, setTempPlate] = useState(result.licensePlate || '');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  // 解析IDが変わったら会話履歴を読み込む
  useEffect(() => {
    if (analysisId) {
      const messages = initialChatHistory?.length ? initialChatHistory : loadChatHistory(analysisId);
      setChatMessages(messages);
    }
  }, [analysisId, initialChatHistory]);

  // チャットメッセージ更新ハンドラ
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
    onUpdateLicensePlate(tempPlate, tempNumber);
    setIsEditingPlate(false);
  };

  const errorRate = actualTonnage 
    ? ((result.estimatedTonnage - actualTonnage) / actualTonnage) * 100 
    : null;

  return (
    <div className="max-w-4xl mx-auto p-2 sm:p-4 space-y-3 sm:space-y-6 pb-24">
      {/* 推定重量メイン表示 */}
      <div className="bg-slate-900 text-white p-3 sm:p-6 rounded-xl sm:rounded-2xl shadow-xl border border-slate-800 relative overflow-hidden">
        <div className="absolute -right-8 -top-8 opacity-10 hidden sm:block">
          <Activity size={120} />
        </div>

        <div className="relative z-10">
          <div className="flex justify-between items-start mb-1 sm:mb-3">
            <p className="text-slate-400 text-[10px] sm:text-xs font-black uppercase tracking-wider">AI 推定重量</p>
            <div className="flex items-center gap-1 sm:gap-2">
              <span className="bg-slate-800 text-blue-400 text-[10px] px-2 py-0.5 rounded-full border border-slate-700 font-black">
                x{result.ensembleCount}
              </span>
              {errorRate !== null && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${Math.abs(errorRate) < 5 ? 'bg-green-500' : 'bg-red-500'}`}>
                  {errorRate > 0 ? '+' : ''}{errorRate.toFixed(1)}%
                </span>
              )}
            </div>
          </div>

          <div className="flex items-baseline gap-1 sm:gap-2">
            <span className="text-4xl sm:text-5xl md:text-6xl font-black text-yellow-500 tracking-tighter">
              {result.estimatedTonnage.toFixed(1)}
            </span>
            <span className="text-lg sm:text-xl font-black text-slate-400">t</span>
          </div>

          <div className="grid grid-cols-3 gap-2 mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-slate-800">
            <div className="text-center">
              <div className="inline-flex bg-slate-800 p-1.5 sm:p-2 rounded-lg mb-1">
                <Truck className="text-blue-400" size={16} />
              </div>
              <p className="text-slate-500 text-[8px] uppercase font-bold">車種</p>
              <p className="font-bold text-[10px] sm:text-xs leading-tight">{result.truckType}</p>
            </div>
            <div className="text-center">
              <div className="inline-flex bg-slate-800 p-1.5 sm:p-2 rounded-lg mb-1">
                <Scale className="text-purple-400" size={16} />
              </div>
              <p className="text-slate-500 text-[8px] uppercase font-bold">最大積載</p>
              <p className="font-bold text-[10px] sm:text-xs leading-tight">
                {result.estimatedMaxCapacity ? `${result.estimatedMaxCapacity}t` : '-'}
              </p>
            </div>
            <div className="text-center">
              <div className="inline-flex bg-slate-800 p-1.5 sm:p-2 rounded-lg mb-1">
                <Layers className="text-green-400" size={16} />
              </div>
              <p className="text-slate-500 text-[8px] uppercase font-bold">体積</p>
              <p className="font-bold text-[10px] sm:text-xs leading-tight">{result.estimatedVolumeM3.toFixed(1)}m³</p>
            </div>
          </div>

          {/* 最大積載量の推定根拠 */}
          {result.maxCapacityReasoning && (
            <div className="mt-3 p-2 bg-slate-800/50 rounded-lg border border-slate-700">
              <p className="text-[10px] text-purple-400 font-bold mb-0.5">推定根拠</p>
              <p className="text-[10px] sm:text-xs text-slate-400">{result.maxCapacityReasoning}</p>
            </div>
          )}
        </div>
      </div>

      {/* 実測値入力セクション */}
      <div className="sticky top-1 sm:top-2 z-30">
        <div className={`p-2 sm:p-4 rounded-xl sm:rounded-2xl border-2 transition-all shadow-lg ${isSaved ? 'bg-slate-900 border-green-500/50' : 'bg-blue-600 border-white'}`}>
          <div className="flex items-center gap-2">
            <Scale size={16} className={isSaved ? 'text-green-400' : 'text-white'} />
            <span className={`text-[10px] sm:text-xs font-bold uppercase ${isSaved ? 'text-green-400' : 'text-white'}`}>
              {isSaved ? '保存済み' : '実測重量'}
            </span>
            {isSaved && <CheckCircle2 className="text-green-500 ml-auto" size={16} />}
          </div>
          <div className="flex gap-2 mt-2">
            <div className="relative flex-grow">
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                value={inputValue}
                onChange={(e) => { setInputValue(e.target.value); setIsSaved(false); }}
                placeholder="0.0"
                className={`w-full h-10 sm:h-12 px-3 sm:px-4 rounded-lg sm:rounded-xl border-none outline-none font-black text-xl sm:text-2xl transition-all ${
                  isSaved ? 'bg-slate-800 text-green-400' : 'bg-white text-slate-900'
                }`}
              />
              <span className={`absolute right-3 top-1/2 -translate-y-1/2 font-bold text-sm ${isSaved ? 'text-green-700' : 'text-slate-300'}`}>
                t
              </span>
            </div>
            <button
              onClick={handleSave}
              disabled={isSaved || !inputValue}
              className={`w-10 sm:w-14 h-10 sm:h-12 rounded-lg sm:rounded-xl flex items-center justify-center transition-all active:scale-95 ${
                isSaved ? "bg-green-500 text-white" : "bg-slate-900 text-white hover:bg-black"
              }`}
            >
              {isSaved ? <Check size={18} strokeWidth={4} /> : <Save size={16} />}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        {/* 画像と車両情報 */}
        <div className="bg-white rounded-xl sm:rounded-2xl overflow-hidden shadow-lg border border-slate-200">
          <div className="p-2 sm:p-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
            <span className="font-bold text-slate-700 flex items-center gap-1.5 text-xs sm:text-sm uppercase">
              <CreditCard className="text-blue-600" size={14} />
              ナンバー
            </span>
            <div>
              {isEditingPlate ? (
                <div className="flex items-center gap-1.5 bg-blue-50 p-1 rounded-lg border border-blue-200">
                  <input
                    type="text"
                    value={tempNumber}
                    onChange={(e) => setTempNumber(e.target.value)}
                    className="text-xs font-bold border border-blue-300 rounded px-2 py-1 w-20 outline-none uppercase"
                    autoFocus
                  />
                  <button onClick={handlePlateSave} className="bg-blue-600 text-white px-2 py-1 rounded text-[10px] font-bold">OK</button>
                </div>
              ) : (
                <button
                  onClick={() => setIsEditingPlate(true)}
                  className="flex items-center gap-1.5 group"
                >
                  <div className="bg-slate-900 text-white px-2 py-1 rounded-lg flex items-center gap-1.5 group-hover:bg-black transition-colors">
                    <span className="text-xs font-bold tracking-wider">{result.licenseNumber || '----'}</span>
                    <Edit2 size={10} className="text-blue-400" />
                  </div>
                </button>
              )}
            </div>
          </div>
          <div className="p-1.5">
            {imageUrls.map((url, i) => (
              <img key={i} src={url} className="w-full h-auto aspect-video object-cover rounded-lg" />
            ))}
          </div>
        </div>

        {/* 推論の根拠と材質 */}
        <div className="space-y-3">
          <div className="bg-white p-3 sm:p-4 rounded-xl sm:rounded-2xl shadow-lg border border-slate-200">
            <h3 className="text-xs sm:text-sm font-bold text-slate-800 mb-2 flex items-center gap-1.5 uppercase">
              <Info className="text-blue-500" size={14} />
              AI判断理由
            </h3>
            <div className="bg-slate-50 p-2 sm:p-3 rounded-lg border border-slate-100 mb-3">
              <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">"{result.reasoning}"</p>
            </div>

            <div className="w-full">
              <p className="text-[10px] font-bold text-slate-400 mb-2 uppercase">材質構成</p>
              <div className="space-y-2">
                {result.materialBreakdown.map((item, index) => (
                  <div key={index}>
                    <div className="flex justify-between text-[10px] sm:text-xs font-bold text-slate-700 mb-0.5">
                      <span>{item.material}</span>
                      <span>{item.percentage}%</span>
                    </div>
                    <div className="w-full h-1.5 sm:h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full transition-all duration-1000"
                        style={{ width: `${item.percentage}%`, backgroundColor: COLORS[index % COLORS.length] }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* AIに質問セクション（別コンポーネント） */}
      <AIChatSection
        key={analysisId}  // analysisId変更時に内部状態をリセット
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
