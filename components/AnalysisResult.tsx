
import React, { useState, useRef, useEffect } from 'react';
import { EstimationResult, ChatMessage } from '../types';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell } from 'recharts';
import { Truck, Layers, Info, CheckCircle2, Save, Scale, CreditCard, Edit2, Activity, Check, MessageCircle, Send, Loader2, Bot, User, Copy, CheckCheck, Trash2 } from 'lucide-react';
import { askFollowUp } from '../services/geminiService';

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

const AnalysisResult: React.FC<AnalysisResultProps> = ({ result, imageUrls, base64Images, analysisId, actualTonnage, initialChatHistory, onSaveActualTonnage, onUpdateLicensePlate, onUpdateChatHistory }) => {
  const [inputValue, setInputValue] = useState(actualTonnage?.toString() || '');
  const [isSaved, setIsSaved] = useState(!!actualTonnage);
  const [isEditingPlate, setIsEditingPlate] = useState(false);
  const [tempNumber, setTempNumber] = useState(result.licenseNumber || '');
  const [tempPlate, setTempPlate] = useState(result.licensePlate || '');

  // チャット機能のステート
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [questionInput, setQuestionInput] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // 解析IDが変わったら会話履歴を読み込む（ストックデータ優先）
  useEffect(() => {
    if (analysisId) {
      // ストックデータに会話履歴があればそれを使用、なければlocalStorageから
      const messages = initialChatHistory?.length ? initialChatHistory : loadChatHistory(analysisId);
      setChatMessages(messages);
      if (messages.length > 0) {
        setShowChat(true);
      }
    }
  }, [analysisId, initialChatHistory]);

  // 会話が更新されたら自動保存（ストック+localStorage両方）
  useEffect(() => {
    if (analysisId && chatMessages.length > 0) {
      saveChatHistory(analysisId, chatMessages);
      // ストックデータにも保存
      onUpdateChatHistory?.(chatMessages);
    }
  }, [chatMessages, analysisId, onUpdateChatHistory]);

  // チャットが更新されたら自動スクロール
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  // 個別メッセージをコピー
  const copyMessage = async (content: string, index: number) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (e) {
      console.error('Failed to copy', e);
    }
  };

  // 全会話をコピー
  const copyAllChat = async () => {
    const text = chatMessages.map(m =>
      `${m.role === 'user' ? '質問' : 'AI'}: ${m.content}`
    ).join('\n\n');

    const header = `【解析結果サマリー】
推定重量: ${result.estimatedTonnage}t
車両: ${result.truckType}
材質: ${result.materialType}
ナンバー: ${result.licenseNumber || '不明'}

【会話記録】
`;

    try {
      await navigator.clipboard.writeText(header + text);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    } catch (e) {
      console.error('Failed to copy all', e);
    }
  };

  // 会話履歴をクリア
  const handleClearChat = () => {
    if (confirm('会話履歴を削除しますか？')) {
      setChatMessages([]);
      if (analysisId) {
        clearChatHistory(analysisId);
      }
      // ストックデータからもクリア
      onUpdateChatHistory?.([]);
    }
  };

  const handleAskQuestion = async () => {
    if (!questionInput.trim() || isAsking) return;

    const question = questionInput.trim();
    setQuestionInput('');
    setIsAsking(true);

    // ユーザーの質問を追加
    setChatMessages(prev => [...prev, { role: 'user', content: question }]);

    try {
      const answer = await askFollowUp(base64Images, result, chatMessages, question);
      setChatMessages(prev => [...prev, { role: 'assistant', content: answer }]);
    } catch (err: any) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: `エラー: ${err.message}` }]);
    } finally {
      setIsAsking(false);
    }
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
    <div className="max-w-4xl mx-auto p-4 space-y-8 pb-40">
      {/* 推定重量メイン表示 */}
      <div className="bg-slate-900 text-white p-10 rounded-[3rem] shadow-2xl border border-slate-800 relative overflow-hidden">
        <div className="absolute -right-8 -top-8 opacity-10">
          <Activity size={200} />
        </div>
        
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-4">
            <p className="text-slate-400 text-sm font-black uppercase tracking-[0.2em]">AI 推定総重量</p>
            <div className="flex flex-col items-end gap-2">
              <span className="bg-slate-800 text-blue-400 text-xs px-4 py-1.5 rounded-full border border-slate-700 font-black tracking-widest">
                SAMPLES x{result.ensembleCount}
              </span>
              {errorRate !== null && (
                <span className={`text-xs px-3 py-1 rounded-full font-black shadow-lg ${Math.abs(errorRate) < 5 ? 'bg-green-500' : 'bg-red-500'}`}>
                  誤差: {errorRate > 0 ? '+' : ''}{errorRate.toFixed(1)}%
                </span>
              )}
            </div>
          </div>

          <div className="flex items-baseline gap-4">
            <span className="text-8xl md:text-9xl font-black text-yellow-500 tracking-tighter drop-shadow-2xl">
              {result.estimatedTonnage.toFixed(1)}
            </span>
            <span className="text-3xl font-black text-slate-400 uppercase tracking-widest">Ton</span>
          </div>

          <div className="grid grid-cols-3 gap-4 mt-12 pt-10 border-t border-slate-800">
            <div className="flex items-center gap-3">
              <div className="bg-slate-800 p-3 rounded-2xl">
                <Truck className="text-blue-400" size={28} />
              </div>
              <div>
                <p className="text-slate-500 text-[10px] uppercase font-black tracking-widest mb-1">Vehicle</p>
                <p className="font-black text-lg leading-none">{result.truckType}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="bg-slate-800 p-3 rounded-2xl">
                <Scale className="text-purple-400" size={28} />
              </div>
              <div>
                <p className="text-slate-500 text-[10px] uppercase font-black tracking-widest mb-1">Max Cap</p>
                <p className="font-black text-lg leading-none">
                  {result.estimatedMaxCapacity ? `${result.estimatedMaxCapacity}t` : '不明'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="bg-slate-800 p-3 rounded-2xl">
                <Layers className="text-green-400" size={28} />
              </div>
              <div>
                <p className="text-slate-500 text-[10px] uppercase font-black tracking-widest mb-1">Volume</p>
                <p className="font-black text-lg leading-none">{result.estimatedVolumeM3.toFixed(1)} m³</p>
              </div>
            </div>
          </div>

          {/* 最大積載量の推定根拠 */}
          {result.maxCapacityReasoning && (
            <div className="mt-6 p-4 bg-slate-800/50 rounded-2xl border border-slate-700">
              <p className="text-xs text-purple-400 font-bold mb-1">最大積載量の推定根拠</p>
              <p className="text-sm text-slate-400">{result.maxCapacityReasoning}</p>
            </div>
          )}
        </div>
      </div>

      {/* 実測値入力セクション */}
      <div className="sticky top-4 z-30 transition-all duration-500">
        <div className={`p-8 rounded-[2.5rem] border-4 transition-all shadow-2xl ${isSaved ? 'bg-slate-900 border-green-500/50' : 'bg-blue-600 border-white animate-in zoom-in-95'}`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className={`text-sm font-black flex items-center gap-3 uppercase tracking-[0.2em] ${isSaved ? 'text-green-400' : 'text-white'}`}>
              <Scale size={24} />
              {isSaved ? '学習済みデータ' : '実測重量を入力 (AI学習用)'}
            </h3>
            {isSaved && <CheckCircle2 className="text-green-500" size={28} />}
          </div>
          
          <div className="flex gap-4">
            <div className="relative flex-grow">
              <input 
                type="number" 
                inputMode="decimal"
                step="0.01" 
                value={inputValue}
                onChange={(e) => { setInputValue(e.target.value); setIsSaved(false); }}
                placeholder="0.0"
                className={`w-full h-20 px-8 rounded-3xl border-none outline-none font-black text-4xl transition-all ${
                  isSaved ? 'bg-slate-800 text-green-400' : 'bg-white text-slate-900 shadow-inner'
                }`}
              />
              <span className={`absolute right-8 top-1/2 -translate-y-1/2 font-black text-xl ${isSaved ? 'text-green-700' : 'text-slate-300'}`}>
                TON
              </span>
            </div>
            <button 
              onClick={handleSave}
              disabled={isSaved || !inputValue}
              className={`min-w-[120px] h-20 rounded-3xl flex flex-col items-center justify-center gap-1 transition-all active:scale-95 ${
                isSaved 
                  ? "bg-green-500 text-white" 
                  : "bg-slate-900 text-white shadow-2xl hover:bg-black"
              }`}
            >
              {isSaved ? <Check size={32} strokeWidth={4} /> : <Save size={28} />}
              <span className="text-[10px] font-black uppercase tracking-widest">
                {isSaved ? "Saved" : "Save"}
              </span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* 画像と車両情報 */}
        <div className="bg-white rounded-[2.5rem] overflow-hidden shadow-xl border border-slate-200">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
            <span className="font-black text-slate-700 flex items-center gap-3 text-lg uppercase tracking-widest">
              <CreditCard className="text-blue-600" size={24} />
              Vehicle Tag
            </span>
            <div>
              {isEditingPlate ? (
                <div className="flex items-center gap-2 bg-blue-50 p-2 rounded-xl border border-blue-200">
                  <input 
                    type="text" 
                    value={tempNumber} 
                    onChange={(e) => setTempNumber(e.target.value)}
                    className="text-lg font-black border border-blue-300 rounded px-4 py-2 w-32 outline-none uppercase"
                    autoFocus
                  />
                  <button onClick={handlePlateSave} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-black">OK</button>
                </div>
              ) : (
                <button 
                  onClick={() => setIsEditingPlate(true)}
                  className="flex flex-col items-end group"
                >
                  <div className="bg-slate-900 text-white px-5 py-2 rounded-xl flex items-center gap-3 shadow-lg group-hover:bg-black transition-colors">
                    <span className="text-xl font-black tracking-widest">{result.licenseNumber || '----'}</span>
                    <Edit2 size={14} className="text-blue-400" />
                  </div>
                  <span className="text-xs text-slate-400 font-bold mt-1 px-1">{result.licensePlate || '未設定'}</span>
                </button>
              )}
            </div>
          </div>
          <div className="p-2 grid grid-cols-1 gap-2">
            {imageUrls.map((url, i) => (
              <img key={i} src={url} className="w-full h-auto aspect-video object-cover rounded-2xl shadow-inner" />
            ))}
          </div>
        </div>

        {/* 推論の根拠と材質 */}
        <div className="space-y-8">
          <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-200">
            <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-3 uppercase tracking-widest">
              <Info className="text-blue-500" size={24} />
              AI Reasoning
            </h3>
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 mb-8">
              <p className="text-slate-600 font-medium text-lg italic leading-relaxed">"{result.reasoning}"</p>
            </div>

            <div className="w-full">
              <p className="text-xs font-black text-slate-400 mb-6 uppercase tracking-[0.3em]">Material Composition</p>
              <div className="space-y-4">
                {result.materialBreakdown.map((item, index) => (
                  <div key={index}>
                    <div className="flex justify-between text-sm font-black text-slate-700 mb-2 uppercase">
                      <span>{item.material}</span>
                      <span>{item.percentage}%</span>
                    </div>
                    <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden">
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

      {/* AIに質問セクション */}
      <div className="bg-slate-900 rounded-[2.5rem] shadow-xl border border-slate-800 overflow-hidden">
        <button
          onClick={() => setShowChat(!showChat)}
          className="w-full p-6 flex items-center justify-between text-white hover:bg-slate-800 transition-colors"
        >
          <div className="flex items-center gap-4">
            <div className="bg-blue-500/20 p-3 rounded-2xl">
              <MessageCircle className="text-blue-400" size={28} />
            </div>
            <div className="text-left">
              <h3 className="text-lg font-black uppercase tracking-widest">AIに質問する</h3>
              <p className="text-sm text-slate-400">なぜこの推定になったか詳しく聞く</p>
            </div>
          </div>
          <div className={`transform transition-transform ${showChat ? 'rotate-180' : ''}`}>
            <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>

        {showChat && (
          <div className="border-t border-slate-800">
            {/* ツールバー */}
            {chatMessages.length > 0 && (
              <div className="flex items-center justify-between px-6 py-3 border-b border-slate-800 bg-slate-800/50">
                <span className="text-xs text-slate-400 font-bold">
                  {chatMessages.length}件の会話
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={copyAllChat}
                    className="flex items-center gap-2 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    {copiedAll ? <CheckCheck size={14} className="text-green-400" /> : <Copy size={14} />}
                    {copiedAll ? 'コピー完了' : '全てコピー'}
                  </button>
                  <button
                    onClick={handleClearChat}
                    className="flex items-center gap-2 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-400 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <Trash2 size={14} />
                    クリア
                  </button>
                </div>
              </div>
            )}

            {/* 会話履歴 */}
            <div className="max-h-96 overflow-y-auto p-6 space-y-4">
              {chatMessages.length === 0 && (
                <div className="text-center py-8">
                  <Bot className="mx-auto text-slate-600 mb-4" size={48} />
                  <p className="text-slate-500 text-sm">
                    解析結果について質問してみてください
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2 justify-center">
                    {['なぜこの重量になった？', '材質の判断根拠は？', '体積はどう計算した？'].map((q, i) => (
                      <button
                        key={i}
                        onClick={() => setQuestionInput(q)}
                        className="text-xs bg-slate-800 text-slate-300 px-4 py-2 rounded-full hover:bg-slate-700 transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {chatMessages.map((msg, index) => (
                <div
                  key={index}
                  className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'} group`}
                >
                  {msg.role === 'assistant' && (
                    <div className="bg-blue-500/20 p-2 rounded-xl h-fit">
                      <Bot className="text-blue-400" size={20} />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] p-4 rounded-2xl relative ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-800 text-slate-200'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    <button
                      onClick={() => copyMessage(msg.content, index)}
                      className={`absolute -bottom-2 -right-2 p-1.5 rounded-lg transition-all opacity-0 group-hover:opacity-100 ${
                        copiedIndex === index
                          ? 'bg-green-500 text-white'
                          : 'bg-slate-600 hover:bg-slate-500 text-slate-300'
                      }`}
                    >
                      {copiedIndex === index ? <CheckCheck size={12} /> : <Copy size={12} />}
                    </button>
                  </div>
                  {msg.role === 'user' && (
                    <div className="bg-slate-700 p-2 rounded-xl h-fit">
                      <User className="text-slate-300" size={20} />
                    </div>
                  )}
                </div>
              ))}

              {isAsking && (
                <div className="flex gap-3 justify-start">
                  <div className="bg-blue-500/20 p-2 rounded-xl h-fit">
                    <Bot className="text-blue-400" size={20} />
                  </div>
                  <div className="bg-slate-800 text-slate-200 p-4 rounded-2xl">
                    <Loader2 className="animate-spin" size={20} />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* 入力欄 */}
            <div className="p-4 border-t border-slate-800">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={questionInput}
                  onChange={(e) => setQuestionInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleAskQuestion()}
                  placeholder="質問を入力... (例: なぜ10トンと判断した？)"
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-2xl px-5 py-4 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                  disabled={isAsking}
                />
                <button
                  onClick={handleAskQuestion}
                  disabled={!questionInput.trim() || isAsking}
                  className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white px-6 rounded-2xl transition-all active:scale-95"
                >
                  {isAsking ? <Loader2 className="animate-spin" size={24} /> : <Send size={24} />}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AnalysisResult;
