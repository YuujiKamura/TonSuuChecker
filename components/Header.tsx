// ビルド時に埋め込まれるコミットハッシュ
declare const __COMMIT_HASH__: string;

import React from 'react';
import { Truck, Database } from 'lucide-react';

type ApiKeyStatus = 'unchecked' | 'checking' | 'valid' | 'invalid' | 'expired' | 'quota_exceeded' | 'missing';

interface HeaderProps {
  onReset: () => void;
  costDisplay?: string;
  isFreeTier?: boolean;
  onCostClick?: () => void;
  storageUsed?: number;  // bytes
  storageQuota?: number; // bytes
  apiKeyStatus?: ApiKeyStatus;
  onStatusClick?: () => void;  // クリックで再検証
}

interface StatusDisplay {
  label: string;
  textClass: string;
  dotClass: string;
  title: string;
  prominent: boolean;
}

const getStatusDisplay = (status: ApiKeyStatus | undefined): StatusDisplay => {
  switch (status) {
    case 'checking':
      return {
        label: '検証中',
        textClass: 'text-blue-400',
        dotClass: 'bg-blue-500 animate-pulse',
        title: 'APIキーを検証中...',
        prominent: false,
      };
    case 'valid':
      return {
        label: 'Active',
        textClass: 'text-green-400',
        dotClass: 'bg-green-500 shadow-[0_0_8px_#22c55e]',
        title: 'APIキー有効（タップで再検証）',
        prominent: false,
      };
    case 'invalid':
      return {
        label: '無効',
        textClass: 'text-red-400',
        dotClass: 'bg-red-500 animate-pulse',
        title: 'APIキーが無効です',
        prominent: true,
      };
    case 'expired':
      return {
        label: '期限切れ',
        textClass: 'text-red-400',
        dotClass: 'bg-red-500 animate-pulse',
        title: 'APIキーの期限が切れています',
        prominent: true,
      };
    case 'quota_exceeded':
      return {
        label: '制限中',
        textClass: 'text-amber-400',
        dotClass: 'bg-amber-500 animate-pulse',
        title: 'API利用制限に達しています',
        prominent: false,
      };
    case 'missing':
      return {
        label: '未設定',
        textClass: 'text-red-400',
        dotClass: 'bg-red-500',
        title: 'APIキーが設定されていません',
        prominent: true,
      };
    case 'unchecked':
    default:
      return {
        label: '---',
        textClass: 'text-slate-500',
        dotClass: 'bg-slate-500',
        title: '未検証',
        prominent: false,
      };
  }
};

// バイト数を読みやすい形式に変換
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const Header: React.FC<HeaderProps> = ({ onReset, costDisplay, isFreeTier, onCostClick, storageUsed, storageQuota, apiKeyStatus, onStatusClick }) => {
  const storagePercent = storageQuota ? Math.round((storageUsed || 0) / storageQuota * 100) : 0;
  const { label: statusLabel, textClass: statusTextClass, dotClass: statusDotClass, title: statusTitle, prominent } = getStatusDisplay(apiKeyStatus);

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
          <div className="flex items-baseline gap-2">
            <h1 className="text-sm font-black tracking-tight leading-none">トン数チェッカー</h1>
            <span className="text-[9px] text-slate-500 font-mono">{__COMMIT_HASH__}</span>
          </div>
          <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest mt-0.5">Weight AI Agent</p>
        </div>
      </div>

      {/* Status indicator (Right side) */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* ストレージ使用量 */}
        {storageUsed !== undefined && (
          <div
            className="flex items-center gap-1 sm:gap-1.5 text-[10px] font-bold px-1.5 sm:px-2 py-1 rounded-full bg-slate-800 text-slate-400"
            title={`ストレージ: ${formatBytes(storageUsed || 0)} / ${formatBytes(storageQuota || 0)}`}
          >
            <Database size={12} />
            <span className="hidden sm:inline">{formatBytes(storageUsed || 0)}</span>
            {storagePercent > 0 && (
              <div className="w-8 sm:w-12 h-1.5 bg-slate-700 rounded-full overflow-hidden">
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
        <button
          onClick={onStatusClick}
          className={`flex items-center gap-1.5 active:scale-95 transition-transform ${
            prominent ? 'px-2 py-1 rounded-lg border border-red-500/50 bg-red-500/10' : ''
          }`}
          title={statusTitle}
        >
          <div className="flex flex-col items-end">
            <span className="text-[8px] font-black text-blue-500 uppercase tracking-widest">API</span>
            <span className={`text-[10px] font-black uppercase ${statusTextClass}`}>{statusLabel}</span>
          </div>
          <div className={`${prominent ? 'w-2.5 h-2.5' : 'w-2 h-2'} rounded-full ${statusDotClass}`}></div>
        </button>
      </div>
    </header>
  );
};

export default Header;
