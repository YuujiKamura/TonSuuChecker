import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, EstimationResult } from '../types';
import { MessageCircle, Send, Loader2, Bot, User, Copy, CheckCheck, Trash2, RefreshCcw } from 'lucide-react';
import { askFollowUp, isQuotaError, QUOTA_ERROR_MESSAGE } from '../services/geminiService';

interface AIChatSectionProps {
  result: EstimationResult;
  base64Images: string[];
  chatMessages: ChatMessage[];
  onUpdateMessages: (messages: ChatMessage[]) => void;
  onReanalyzeWithFeedback?: (chatHistory: ChatMessage[]) => void;
}

const AIChatSection: React.FC<AIChatSectionProps> = ({
  result,
  base64Images,
  chatMessages,
  onUpdateMessages,
  onReanalyzeWithFeedback,
}) => {
  const [questionInput, setQuestionInput] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [showChat, setShowChat] = useState(chatMessages.length > 0);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(chatMessages.length);
  const isInitialLoadRef = useRef(true);

  // 新しいメッセージが追加されたときだけスクロール（初期読み込み時は除く）
  useEffect(() => {
    const isNewMessage = chatMessages.length > prevMessageCountRef.current;
    prevMessageCountRef.current = chatMessages.length;

    // 初期読み込み完了後、新しいメッセージが追加されたときだけスクロール
    if (messagesEndRef.current && showChat && isNewMessage && !isInitialLoadRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }

    // 初期読み込みフラグをオフにする
    if (isInitialLoadRef.current && chatMessages.length > 0) {
      isInitialLoadRef.current = false;
    }
  }, [chatMessages, showChat]);

  // 初期表示時にメッセージがあればチャットを開く
  useEffect(() => {
    if (chatMessages.length > 0) {
      setShowChat(true);
    }
  }, [chatMessages.length]);

  const copyMessage = async (content: string, index: number) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (e) {
      console.error('Failed to copy', e);
    }
  };

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

  const handleClearChat = () => {
    if (confirm('会話履歴を削除しますか？')) {
      onUpdateMessages([]);
    }
  };

  const handleAskQuestion = async () => {
    if (!questionInput.trim() || isAsking) return;

    const question = questionInput.trim();
    setQuestionInput('');
    setIsAsking(true);

    const newMessages = [...chatMessages, { role: 'user' as const, content: question }];
    onUpdateMessages(newMessages);

    try {
      const answer = await askFollowUp(base64Images, result, chatMessages, question);
      onUpdateMessages([...newMessages, { role: 'assistant' as const, content: answer }]);
    } catch (err: any) {
      const errorMessage = isQuotaError(err)
        ? `⚠️ ${QUOTA_ERROR_MESSAGE}`
        : `エラー: ${err.message}`;
      onUpdateMessages([...newMessages, { role: 'assistant' as const, content: errorMessage }]);
    } finally {
      setIsAsking(false);
    }
  };

  return (
    <div className="bg-slate-900 rounded-xl sm:rounded-2xl shadow-lg border border-slate-800">
      {/* ヘッダー（トグル） */}
      <button
        onClick={() => setShowChat(!showChat)}
        className="w-full p-3 sm:p-4 flex items-center justify-between text-white hover:bg-slate-800 transition-colors"
      >
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="bg-blue-500/20 p-1.5 sm:p-2 rounded-lg">
            <MessageCircle className="text-blue-400" size={18} />
          </div>
          <div className="text-left">
            <h3 className="text-xs sm:text-sm font-bold uppercase">AIに質問</h3>
            <p className="text-[10px] text-slate-400 hidden sm:block">なぜこの推定になったか詳しく聞く</p>
          </div>
        </div>
        <div className={`transform transition-transform ${showChat ? 'rotate-180' : ''}`}>
          <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* チャット本体 */}
      {showChat && (
        <>
          {/* ツールバー */}
          {chatMessages.length > 0 && (
            <div className="flex items-center justify-between px-3 py-2 border-t border-slate-800 bg-slate-800/50">
              <span className="text-[10px] text-slate-400 font-bold">
                {chatMessages.length}件
              </span>
              <div className="flex gap-1.5 flex-wrap justify-end">
                <button
                  onClick={copyAllChat}
                  className="flex items-center gap-1 text-[10px] bg-slate-700 hover:bg-slate-600 text-slate-300 px-2 py-1 rounded transition-colors"
                >
                  {copiedAll ? <CheckCheck size={12} className="text-green-400" /> : <Copy size={12} />}
                </button>
                <button
                  onClick={handleClearChat}
                  className="flex items-center gap-1 text-[10px] bg-red-500/20 hover:bg-red-500/30 text-red-400 px-2 py-1 rounded transition-colors"
                >
                  <Trash2 size={12} />
                </button>
                {onReanalyzeWithFeedback && (
                  <button
                    onClick={() => onReanalyzeWithFeedback(chatMessages)}
                    className="flex items-center gap-1 text-[10px] bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 px-2 py-1 rounded transition-colors"
                  >
                    <RefreshCcw size={12} />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* メッセージ一覧 */}
          <div className="p-3 space-y-3 border-t border-slate-800">
            {chatMessages.length === 0 && (
              <div className="text-center py-4">
                <Bot className="mx-auto text-slate-600 mb-2" size={32} />
                <p className="text-slate-500 text-xs">解析結果について質問</p>
                <div className="mt-3 flex flex-wrap gap-1.5 justify-center">
                  {['なぜこの重量？', '材質の根拠', '体積計算'].map((q, i) => (
                    <button
                      key={i}
                      onClick={() => setQuestionInput(q)}
                      className="text-[10px] bg-slate-800 text-slate-300 px-3 py-1.5 rounded-full hover:bg-slate-700 transition-colors"
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
                className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'} group`}
              >
                {msg.role === 'assistant' && (
                  <div className="bg-blue-500/20 p-1.5 rounded-lg h-fit flex-shrink-0">
                    <Bot className="text-blue-400" size={14} />
                  </div>
                )}
                <div
                  className={`max-w-[80%] p-2 sm:p-3 rounded-xl relative ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800 text-slate-200'
                  }`}
                >
                  <p className="text-xs whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  <button
                    onClick={() => copyMessage(msg.content, index)}
                    className={`absolute -bottom-1 -right-1 p-1 rounded transition-all opacity-0 group-hover:opacity-100 ${
                      copiedIndex === index
                        ? 'bg-green-500 text-white'
                        : 'bg-slate-600 hover:bg-slate-500 text-slate-300'
                    }`}
                  >
                    {copiedIndex === index ? <CheckCheck size={10} /> : <Copy size={10} />}
                  </button>
                </div>
                {msg.role === 'user' && (
                  <div className="bg-slate-700 p-1.5 rounded-lg h-fit flex-shrink-0">
                    <User className="text-slate-300" size={14} />
                  </div>
                )}
              </div>
            ))}

            {isAsking && (
              <div className="flex gap-2 justify-start">
                <div className="bg-blue-500/20 p-1.5 rounded-lg h-fit">
                  <Bot className="text-blue-400" size={14} />
                </div>
                <div className="bg-slate-800 text-slate-200 p-2 rounded-xl">
                  <Loader2 className="animate-spin" size={16} />
                </div>
              </div>
            )}

            {/* スクロール用アンカー */}
            <div ref={messagesEndRef} />
          </div>

          {/* 入力欄 */}
          <div className="p-2 border-t border-slate-800">
            <div className="flex gap-2">
              <input
                type="text"
                value={questionInput}
                onChange={(e) => setQuestionInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleAskQuestion()}
                placeholder="質問を入力..."
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                disabled={isAsking}
              />
              <button
                onClick={handleAskQuestion}
                disabled={!questionInput.trim() || isAsking}
                className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white px-3 rounded-lg transition-all active:scale-95"
              >
                {isAsking ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AIChatSection;
