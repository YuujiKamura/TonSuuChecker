import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { DollarSign, TrendingUp, Zap, Trash2, ArrowLeft } from 'lucide-react';
import { getTotalCost, getTodayCost, getDailyCosts, getModelBreakdown, clearCostHistory, getCostHistory, formatCost, getCurrency } from '../services/costTracker';
import { isGoogleAIStudioKey } from '../services/geminiService';

interface CostDashboardProps {
  isOpen: boolean;
  onClose: () => void;
}

const CostDashboard: React.FC<CostDashboardProps> = ({ isOpen, onClose }) => {
  const [totalCost, setTotalCost] = useState(0);
  const [todayCost, setTodayCost] = useState(0);
  const [dailyCosts, setDailyCosts] = useState<{ date: string; totalCost: number; callCount: number }[]>([]);
  const [modelBreakdown, setModelBreakdown] = useState<{ model: string; cost: number; count: number }[]>([]);
  const [totalCalls, setTotalCalls] = useState(0);
  const [isFreeTier, setIsFreeTier] = useState(false);
  const currency = getCurrency();

  const refreshData = async () => {
    const [total, today, daily, breakdown, history] = await Promise.all([
      getTotalCost(),
      getTodayCost(),
      getDailyCosts(7),
      getModelBreakdown(),
      getCostHistory()
    ]);
    setTotalCost(total);
    setTodayCost(today);
    setDailyCosts(daily);
    setModelBreakdown(breakdown);
    setTotalCalls(history.length);
    setIsFreeTier(isGoogleAIStudioKey());
  };

  useEffect(() => {
    if (isOpen) {
      refreshData();
    }
  }, [isOpen]);

  const handleClear = async () => {
    if (confirm('コスト履歴をすべて削除しますか？')) {
      await clearCostHistory();
      await refreshData();
    }
  };

  if (!isOpen) return null;

  // グラフ用データ（ローカル通貨で）
  const chartData = dailyCosts.map(d => ({
    date: d.date.slice(5),
    cost: Number((d.totalCost * currency.rate).toFixed(2)),
    calls: d.callCount
  }));

  const modelColors: Record<string, string> = {
    'gemini-3-flash-preview': '#eab308',
    'gemini-flash-lite-latest': '#22c55e',
    'gemini-3-pro-preview': '#3b82f6',
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all shrink-0"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <DollarSign className="text-green-500 shrink-0" size={24} />
            <h2 className="text-xl font-black text-white">APIコスト履歴</h2>
            {isFreeTier && (
              <span className="px-3 py-1 bg-green-500/20 border border-green-500/30 rounded-full text-xs font-bold text-green-400 shrink-0">
                🆓 無料枠
              </span>
            )}
          </div>
        </div>

        {/* サマリーカード */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700">
            <p className="text-xs text-slate-500 uppercase font-bold mb-1">今日のコスト</p>
            <p className="text-2xl font-black text-green-400">{formatCost(todayCost)}</p>
          </div>
          <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700">
            <p className="text-xs text-slate-500 uppercase font-bold mb-1">累計コスト</p>
            <p className="text-2xl font-black text-yellow-400">{formatCost(totalCost)}</p>
          </div>
          <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700">
            <p className="text-xs text-slate-500 uppercase font-bold mb-1">総API呼び出し</p>
            <p className="text-2xl font-black text-blue-400">{totalCalls}</p>
          </div>
        </div>

        {/* 日別グラフ */}
        <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700 mb-6">
          <h3 className="text-sm font-bold text-slate-400 mb-4 flex items-center gap-2">
            <TrendingUp size={16} />
            過去7日間のコスト推移 ({currency.symbol})
          </h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1e293b', 
                    border: '1px solid #475569',
                    borderRadius: '12px'
                  }}
                  formatter={(value: number) => [currency.symbol + value.toFixed(2), 'コスト']}
                />
                <Bar dataKey="cost" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* モデル別内訳 */}
        <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700 mb-6">
          <h3 className="text-sm font-bold text-slate-400 mb-4 flex items-center gap-2">
            <Zap size={16} />
            モデル別内訳
          </h3>
          <div className="space-y-3">
            {modelBreakdown.length === 0 ? (
              <p className="text-slate-500 text-sm">データがありません</p>
            ) : (
              modelBreakdown.map(item => (
                <div key={item.model} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: modelColors[item.model] || '#94a3b8' }}
                    />
                    <span className="text-sm text-slate-300">{item.model}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-white">{formatCost(item.cost)}</span>
                    <span className="text-xs text-slate-500 ml-2">({item.count}回)</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* アクション */}
        <div className="flex justify-between items-center">
          <div className="flex flex-col gap-1">
            {isFreeTier && (
              <p className="text-xs text-green-400 font-bold">
                🆓 Google AI Studioの無料枠を使用中です。料金は発生しません。
              </p>
            )}
            <p className="text-xs text-slate-600">
              ※コストは推定値です。実際の請求額とは異なる場合があります。
            </p>
          </div>
          <button
            onClick={handleClear}
            className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 transition-colors"
          >
            <Trash2 size={16} />
            履歴をクリア
          </button>
        </div>
      </div>
    </div>
  );
};

export default CostDashboard;
