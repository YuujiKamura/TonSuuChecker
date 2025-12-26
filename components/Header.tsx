import React from 'react';
import { Truck, Database } from 'lucide-react';

interface HeaderProps {
  onReset: () => void;
  costDisplay?: string;
  isFreeTier?: boolean;
  onCostClick?: () => void;
  storageUsed?: number;  // bytes
  storageQuota?: number; // bytes
}

// バイト数を読みやすい形式に変換
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const Header: React.FC<HeaderProps> = ({ onReset, costDisplay, isFreeTier, onCostClick, storageUsed, storageQuota }) => {
  const storagePercent = storageQuota ? Math.round((storageUsed || 0) / storageQuota * 100) : 0;

  return (
    <header className="bg-slate-950/90 backdrop-blur-xl text-white h-16 flex items-center justify-between px-4 sticky top-0 z-[100] border-b border-slate-800 shadow-2xl">
      {/* Logo Area */}
      <div
        className="flex items-center gap-2 cursor-pointer active:scale-95 transition-transform"
        onClick={onReset}
      >
        <div className="bg-yellow-500 p-1.5 rounded-lg shadow-inner">
          <Truck className="text-slate-900" size={20} />
        </div>
        <div>
          <h1 className="text-sm font-black tracking-tight leading-none">トン数チェッカー</h1>
          <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest mt-0.5">Weight AI Agent</p>
        </div>
      </div>

      {/* Status indicator (Right side) */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* ストレージ使用量 */}
        {storageUsed !== undefined && (
          <div
            className="hidden sm:flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-full bg-slate-800 text-slate-400"
            title={`ストレージ: ${formatBytes(storageUsed || 0)} / ${formatBytes(storageQuota || 0)}`}
          >
            <Database size={12} />
            <span>{formatBytes(storageUsed || 0)}</span>
            {storagePercent > 0 && (
              <div className="w-12 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    storagePercent > 80 ? 'bg-red-500' : storagePercent > 50 ? 'bg-yellow-500' : 'bg-blue-500'
                  }`}
                  style={{ width: `${Math.min(storagePercent, 100)}%` }}
                />
              </div>
            )}
          </div>
        )}
        {/* コスト表示 */}
        {costDisplay && (
          <button
            onClick={onCostClick}
            className={`text-[10px] font-bold px-2 py-1 rounded-full transition-all ${
              isFreeTier
                ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
            title={isFreeTier ? '無料枠' : '今日のコスト'}
          >
            {isFreeTier && <span className="mr-1">🆓</span>}
            {costDisplay}
          </button>
        )}
        <div className="flex flex-col items-end">
          <span className="text-[8px] font-black text-blue-500 uppercase tracking-widest">Status</span>
          <span className="text-[10px] font-black text-slate-300 uppercase">Active</span>
        </div>
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_#22c55e]"></div>
      </div>
    </header>
  );
};

export default Header;
