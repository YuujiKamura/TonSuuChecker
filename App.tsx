
import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import ImageUploader from './components/ImageUploader';
import CameraCapture from './components/CameraCapture';
import CaptureChoice from './components/CaptureChoice';
import StockList from './components/StockList';
import SyncSettings from './components/SyncSettings';
import AnalysisResult from './components/AnalysisResult';
import CostDashboard from './components/CostDashboard';
import { getStockItems, saveStockItem, updateStockItem, deleteStockItem, getTaggedItems } from './services/stockService';
import { getTodayCost, formatCost } from './services/costTracker';
import { initFromUrlParams } from './services/sheetSync';
import { analyzeGaraImageEnsemble, mergeResults, getApiKey, setApiKey, clearApiKey } from './services/geminiService';
import { EstimationResult, AnalysisHistory, StockItem } from './types';
import { Camera, Eye, Cpu, Zap, BrainCircuit, Gauge, Terminal, RefreshCcw, Activity, ListChecks, AlertCircle, CheckCircle2, Search, ZapOff, Key, X, DollarSign, Archive, Cloud, Scale } from 'lucide-react';

interface LogEntry {
  id: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'system';
  timestamp: string;
}

const App: React.FC = () => {
  const [showCamera, setShowCamera] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isBackgroundScanning, setIsBackgroundScanning] = useState(false);
  const [isTargetLocked, setIsTargetLocked] = useState(false);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [monitorGuidance, setMonitorGuidance] = useState<string | null>(null);
  const [ensembleTarget, setEnsembleTarget] = useState(1);
  const [selectedModel, setSelectedModel] = useState<'gemini-3-flash-preview' | 'gemini-3-pro-preview'>('gemini-3-flash-preview');
  const [currentResult, setCurrentResult] = useState<EstimationResult | null>(null);
  const [rawInferences, setRawInferences] = useState<EstimationResult[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [currentImageUrls, setCurrentImageUrls] = useState<string[]>([]);
  const [currentBase64Images, setCurrentBase64Images] = useState<string[]>([]);
  const [history, setHistory] = useState<AnalysisHistory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [analysisStep, setAnalysisStep] = useState(0);
  
  // APIキー関連
  const [hasApiKey, setHasApiKey] = useState(false);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showCostDashboard, setShowCostDashboard] = useState(false);
  const [todaysCost, setTodaysCost] = useState(0);
  
  // ストック・選択関連
  const [pendingCapture, setPendingCapture] = useState<{base64: string, url: string} | null>(null);
  const [showStockList, setShowStockList] = useState(false);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [showSyncSettings, setShowSyncSettings] = useState(false);

  // 最大積載量
  const [maxCapacity, setMaxCapacity] = useState<number | undefined>(undefined);
  
  const requestCounter = useRef(0);
  const activeRequestId = useRef(0);

  // APIキーの状態を初期化時にチェック
  useEffect(() => {
    setHasApiKey(!!getApiKey());
    setTodaysCost(getTodayCost());
    setStockItems(getStockItems());
    // URLパラメータからGAS URLを読み込み
    initFromUrlParams();
  }, []);

  // コスト更新（解析完了後）
  const refreshCost = () => {
    setTodaysCost(getTodayCost());
  };

  const steps = [
    "画像を読み込み中...",
    "車両・ナンバーを検知中...",
    "荷姿・材質を特定中...",
    "体積から重量を推計中...",
    "AIアンサンブル統合中..."
  ];

  useEffect(() => {
    const saved = localStorage.getItem('garaton_history_v4');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load history", e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('garaton_history_v4', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    let interval: any;
    if (loading) {
      setAnalysisStep(0);
      interval = setInterval(() => {
        setAnalysisStep(prev => (prev < steps.length - 1 ? prev + 1 : prev));
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [loading, steps.length]);

  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    const newLog: LogEntry = {
      id: crypto.randomUUID(),
      message,
      type,
      timestamp: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };
    setLogs(prev => [newLog, ...prev.slice(0, 49)]);
  };

  const handleSaveApiKey = () => {
    if (apiKeyInput.trim()) {
      setApiKey(apiKeyInput.trim());
      setHasApiKey(true);
      setShowApiKeyModal(false);
      setApiKeyInput('');
    }
  };

  const handleClearApiKey = () => {
    clearApiKey();
    setHasApiKey(false);
  };

  const startAnalysis = async (base64s: string[], urls: string[], isAuto: boolean = false) => {
    if (!hasApiKey) {
      setError('APIキーが設定されていません。設定してください。');
      setShowApiKeyModal(true);
      return;
    }

    const requestId = ++requestCounter.current;
    activeRequestId.current = requestId;

    if (isAuto) {
      setIsBackgroundScanning(true);
      setMonitorGuidance(null);
    } else {
      setLoading(true);
      setCurrentResult(null);
      setRawInferences([]);
      setCurrentImageUrls(urls);
      setCurrentBase64Images(base64s);
    }
    
    setError(null);
    addLog(isAuto ? `Motion Triggered: Analyzing...` : `推論開始 (x${ensembleTarget})`, isAuto ? 'info' : 'system');

    try {
      const abortSignal = { get cancelled() { return activeRequestId.current !== requestId; } };
      
      // 自動監視時は Lite モデル (gemini-flash-lite-latest) を優先
      const results = await analyzeGaraImageEnsemble(
        base64s,
        isAuto ? 1 : ensembleTarget,
        history,
        (count, lastRes) => {
          if (activeRequestId.current !== requestId) return;
          if (!isAuto) {
            setRawInferences(prev => [...prev, lastRes]);
            addLog(`サンプル #${count} 受信`, 'success');
          }
        },
        abortSignal,
        isAuto ? 'gemini-flash-lite-latest' : selectedModel,
        getTaggedItems(),
        isAuto ? undefined : maxCapacity
      );

      if (activeRequestId.current !== requestId) return;

      if (results.length > 0) {
        const merged = mergeResults(results);
        setIsRateLimited(false); // 成功すれば制限フラグを解除

        if (isAuto) {
          const CONFIDENCE_THRESHOLD = 0.8;
          if (!merged.isTargetDetected || merged.confidenceScore < CONFIDENCE_THRESHOLD) {
            const reason = merged.reasoning.toLowerCase();
            if (reason.includes("荷台") || reason.includes("写っていない")) {
              setMonitorGuidance("荷台が見える位置にカメラを向けてください");
            } else if (reason.includes("トラック") || reason.includes("車両")) {
              setMonitorGuidance("ダンプトラックをフレーム内に収めてください");
            } else {
              setMonitorGuidance("対象を特定できませんでした");
            }
            return;
          }
          
          setIsTargetLocked(true);
          addLog(`ロックオン: 荷姿を検知`, 'success');
          await new Promise(r => setTimeout(r, 1500));
        } else {
          if (!merged.isTargetDetected) {
            setError("トラックや荷姿が確認できません。撮り直してください。");
            return;
          }
        }

        const newId = crypto.randomUUID();
        setCurrentResult(merged);
        setCurrentId(newId);
        setRawInferences(results);
        setCurrentImageUrls(urls);
        

        const newHistoryItem: AnalysisHistory = {
          id: newId,
          timestamp: Date.now(),
          imageUrls: urls,
          result: merged,
        };

        setHistory(prev => [newHistoryItem, ...prev.slice(0, 99)]);
        refreshCost();
      }
    } catch (err: any) {
      if (activeRequestId.current !== requestId) return;
      if (err.message?.includes('429')) {
        setIsRateLimited(true);
        addLog("Quota Limit reached. Slowing down...", 'error');
        if (!isAuto) setError("APIの利用制限に達しました。しばらくお待ちください。");
      } else {
        addLog(`Error: ${err.message}`, 'error');
        if (!isAuto) setError(`エラー: ${err.message}`);
      }
    } finally {
      if (activeRequestId.current === requestId) {
        setLoading(false);
        setIsBackgroundScanning(false);
        setIsTargetLocked(false);
      }
    }
  };

  const resetAnalysis = () => {
    activeRequestId.current = 0;
    setCurrentResult(null);
    setCurrentId(null);
    setCurrentImageUrls([]);
    setCurrentBase64Images([]);
    setRawInferences([]);
    setError(null);
    setLoading(false);
    setIsBackgroundScanning(false);
    setIsTargetLocked(false);
    setMonitorGuidance(null);
    // 全てのモーダル・サブ画面を閉じる
    setShowCamera(false);
    setPendingCapture(null);
    setShowApiKeyModal(false);
    setShowCostDashboard(false);
    setShowStockList(false);
    setShowSyncSettings(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col font-sans text-slate-200">
      <Header 
        onReset={resetAnalysis} 
      />
      
      <main className="flex-grow relative overflow-x-hidden">
        {/* カメラモーダル */}
        {showCamera && (
          <CameraCapture
            onCapture={(base64, url) => {
              setShowCamera(false);
              setPendingCapture({ base64, url });
            }}
            onClose={() => setShowCamera(false)}
            isAnalyzing={loading}
          />
        )}

        {/* 撮影後の選択ダイアログ */}
        {pendingCapture && (
          <CaptureChoice
            imageUrl={pendingCapture.url}
            onAnalyze={() => {
              const { base64, url } = pendingCapture;
              setPendingCapture(null);
              setCurrentImageUrls([url]);
              startAnalysis([base64], [url]);
            }}
            onStock={() => {
              const dataUrl = 'data:image/jpeg;base64,' + pendingCapture.base64;
              const newItem: StockItem = {
                id: crypto.randomUUID(),
                timestamp: Date.now(),
                base64Images: [pendingCapture.base64],
                imageUrls: [dataUrl],
              };
              saveStockItem(newItem);
              setStockItems(getStockItems());
              setPendingCapture(null);
            }}
            onCancel={() => setPendingCapture(null)}
          />
        )}
        
        <div className="max-w-4xl mx-auto w-full px-4 pt-4">
            {/* APIキー状態表示 */}
            <div className="mb-4 flex items-center gap-3">
              <button
                onClick={() => setShowApiKeyModal(true)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-bold transition-all ${hasApiKey ? 'bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20' : 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20 animate-pulse'}`}
              >
                <Key size={16} />
                {hasApiKey ? 'APIキー設定済み' : 'APIキー未設定'}
              </button>
              <button
                onClick={() => setShowCostDashboard(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-bold bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 transition-all"
              >
                {formatCost(todaysCost)}
              </button>
              <button
                onClick={() => setShowStockList(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-bold bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 transition-all"
              >
                <Archive size={16} />
                ストック ({stockItems.length})
              </button>
              <button
                onClick={() => setShowSyncSettings(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-full border text-sm font-bold bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 transition-all"
              >
                <Cloud size={16} />
              </button>
              {hasApiKey && (
                <button
                  onClick={handleClearApiKey}
                  className="text-xs text-slate-500 hover:text-red-400 transition-colors ml-auto"
                >
                  キーを削除
                </button>
              )}
            </div>
            {isRateLimited && (
              <div className="mb-4 bg-amber-500/10 border border-amber-500/30 p-4 rounded-2xl flex items-center gap-4 animate-pulse">
                <ZapOff className="text-amber-500 shrink-0" size={24} />
                <p className="text-sm font-bold text-amber-200 uppercase tracking-widest">API Quota Limit: Automatic Cooldown Mode</p>
              </div>
            )}

            {error && (
              <div className="mt-4 bg-red-500/10 border border-red-500/30 p-6 rounded-3xl flex items-start gap-4 animate-in fade-in zoom-in-95">
                <AlertCircle className="text-red-500 shrink-0" size={28} />
                <div>
                  <p className="text-lg font-bold text-red-200">{error}</p>
                  <button onClick={() => setError(null)} className="mt-3 text-sm font-black uppercase text-red-400 hover:text-red-300">閉じる</button>
                </div>
              </div>
            )}

            {!currentResult && !loading && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-32">
                <ImageUploader 
                  onImagesSelected={(imgs) => {
                    if (loading || imgs.length === 0) return;
                    const img = imgs[0];
                    const dataUrl = 'data:image/jpeg;base64,' + img.base64;
                    setPendingCapture({ base64: img.base64, url: dataUrl });
                  }}
                  onCameraOpen={() => setShowCamera(true)}
                  isLoading={loading} 
                />
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                  <div className="bg-slate-900 rounded-[2rem] p-8 border border-slate-800">
                    <h3 className="text-sm font-black flex items-center gap-3 uppercase text-slate-400 mb-6">
                      <Cpu size={20} className="text-yellow-500" />
                      解析エンジン
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      <button 
                        onClick={() => setSelectedModel('gemini-3-flash-preview')}
                        className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all ${selectedModel.includes('flash') ? 'bg-yellow-500/10 border-yellow-500/50 text-yellow-500' : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700'}`}
                      >
                        <Zap size={24} />
                        <span className="text-xs font-black uppercase tracking-widest">Flash</span>
                      </button>
                      <button 
                        onClick={() => setSelectedModel('gemini-3-pro-preview')}
                        className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all ${selectedModel.includes('pro') ? 'bg-blue-500/10 border-blue-500/50 text-blue-400' : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700'}`}
                      >
                        <BrainCircuit size={24} />
                        <span className="text-xs font-black uppercase tracking-widest">Pro</span>
                      </button>
                    </div>
                  </div>

                  <div className="bg-slate-900 rounded-[2rem] p-8 border border-slate-800">
                    <h3 className="text-sm font-black flex items-center gap-3 uppercase text-slate-400 mb-6">
                      <Gauge size={20} className="text-blue-500" />
                      推論の深さ (x{ensembleTarget})
                    </h3>
                    <input
                      type="range" min="1" max="5" step="1"
                      value={ensembleTarget}
                      onChange={(e) => setEnsembleTarget(parseInt(e.target.value))}
                      className="w-full accent-blue-500 h-2.5 bg-slate-800 rounded-lg appearance-none cursor-pointer mb-4"
                    />
                    <div className="flex justify-between text-xs font-black text-slate-500 uppercase tracking-wider">
                      <span>高速推論</span>
                      <span>推奨</span>
                      <span>最大精度</span>
                    </div>
                  </div>
                </div>

                {/* 最大積載量入力 */}
                <div className="bg-slate-900 rounded-[2rem] p-6 border border-slate-800 mt-4">
                  <h3 className="text-sm font-black flex items-center gap-3 uppercase text-slate-400 mb-4">
                    <Scale size={20} className="text-green-500" />
                    最大積載量（任意）
                  </h3>
                  <p className="text-xs text-slate-500 mb-4">
                    車両の最大積載量がわかる場合は入力してください。8トンダンプなど見た目で判別しにくい車両の推定精度が向上します。
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 grid grid-cols-5 gap-2">
                      {[2, 4, 8, 10, 11].map((t) => (
                        <button
                          key={t}
                          onClick={() => setMaxCapacity(maxCapacity === t ? undefined : t)}
                          className={`py-3 rounded-xl font-black text-sm transition-all ${
                            maxCapacity === t
                              ? 'bg-green-500 text-white'
                              : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                          }`}
                        >
                          {t}t
                        </button>
                      ))}
                    </div>
                    <div className="text-slate-600">|</div>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      placeholder="その他"
                      value={maxCapacity && ![2, 4, 8, 10, 11].includes(maxCapacity) ? maxCapacity : ''}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setMaxCapacity(isNaN(val) ? undefined : val);
                      }}
                      className="w-24 bg-slate-800 border border-slate-700 rounded-xl px-3 py-3 text-white text-center font-bold focus:outline-none focus:border-green-500"
                    />
                  </div>
                  {maxCapacity && (
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-green-400 text-sm font-bold">
                        最大積載量: {maxCapacity}t で解析します
                      </span>
                      <button
                        onClick={() => setMaxCapacity(undefined)}
                        className="text-xs text-slate-500 hover:text-red-400"
                      >
                        クリア
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {(loading || isTargetLocked) && (
              <div className="py-8 animate-in fade-in duration-500">
                <div className="max-w-2xl mx-auto space-y-6">
                  <div className={`relative aspect-video rounded-[2.5rem] overflow-hidden bg-slate-900 border-4 shadow-2xl transition-colors duration-500 ${isTargetLocked ? 'border-red-600' : 'border-slate-800'}`}>
                    {currentImageUrls[0] && (
                      <img 
                        src={currentImageUrls[0]} 
                        className={`w-full h-full object-cover transition-opacity duration-500 ${isTargetLocked ? 'opacity-80' : 'opacity-60'}`}
                        alt="Target"
                      />
                    )}
                    
                    <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%)] bg-[length:100%_4px] pointer-events-none"></div>
                    <div className="absolute inset-0 overflow-hidden">
                      <div className={`w-full h-20 bg-gradient-to-b from-transparent to-transparent absolute top-0 animate-[scan-vertical_3s_ease-in-out_infinite] ${isTargetLocked ? 'via-red-500/50' : 'via-blue-500/30'}`}></div>
                    </div>

                    <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-slate-950/20">
                      <div className={`backdrop-blur-xl border p-8 rounded-3xl shadow-2xl transition-all duration-500 ${isTargetLocked ? 'bg-red-950/80 border-red-500 scale-110' : 'bg-slate-950/80 border-blue-500/30'}`}>
                        <div className="flex items-center justify-center gap-4 mb-6">
                           <Activity className={`${isTargetLocked ? 'text-red-500 animate-bounce' : 'text-blue-500 animate-pulse'}`} size={40} />
                           <div className="h-8 w-px bg-slate-700"></div>
                           <h2 className="text-xl md:text-3xl font-black tracking-widest text-white uppercase">
                            {isTargetLocked ? "TARGET LOCKED ON" : steps[analysisStep]}
                           </h2>
                        </div>
                        <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-1000 ${isTargetLocked ? 'bg-red-500' : 'bg-blue-500'}`} 
                            style={{ width: isTargetLocked ? '100%' : `${((analysisStep + 1) / steps.length) * 100}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-center pt-4">
                    <button onClick={resetAnalysis} className="text-sm font-black text-slate-400 hover:text-white flex items-center gap-3 bg-slate-900 px-10 py-5 rounded-full border border-slate-800 shadow-lg active:scale-95 transition-all">
                      <RefreshCcw size={20} /> 解析を中断
                    </button>
                  </div>
                </div>
              </div>
            )}

            {currentResult && !loading && !isTargetLocked && (
              <div className="pb-32 animate-in fade-in duration-700">
                <div className="p-4 flex justify-between items-center mb-4">
                  <button onClick={resetAnalysis} className="text-sm font-black text-slate-400 bg-slate-900 px-6 py-3 rounded-full border border-slate-800 flex items-center gap-3 active:scale-95 transition-all">
                    <RefreshCcw size={16} /> 別の画像を解析
                  </button>
                  <div className="flex flex-col items-end">
                    <span className="text-xs font-black text-slate-500 uppercase tracking-[0.2em]">
                      ANALYSIS DONE (x{currentResult.ensembleCount})
                    </span>
                    <span className="text-[10px] font-black text-blue-500 uppercase">AI CONFIDENCE: {(currentResult.confidenceScore * 100).toFixed(0)}%</span>
                  </div>
                </div>
                <AnalysisResult
                  result={currentResult}
                  imageUrls={currentImageUrls}
                  base64Images={currentBase64Images}
                  analysisId={currentId || ''}
                  actualTonnage={history.find(h => h.id === currentId)?.actualTonnage}
                  onSaveActualTonnage={(v) => setHistory(prev => prev.map(h => h.id === currentId ? {...h, actualTonnage: v} : h))}
                  onUpdateLicensePlate={(p, n) => setHistory(prev => prev.map(h => h.id === currentId ? {...h, result: {...h.result, licensePlate: p, licenseNumber: n}} : h))}
                />
              </div>
            )}
          </div>

        {history.length > 0 && !loading && !currentResult && !showCamera && (
          <div className="fixed bottom-12 left-0 right-0 p-6 pointer-events-none z-40">
            <div className="max-w-lg mx-auto space-y-3 pointer-events-auto">
              <h3 className="text-xs font-black text-slate-500 uppercase flex items-center gap-2 mb-2 bg-slate-950/90 backdrop-blur-xl w-fit px-4 py-2 rounded-full border border-slate-800">
                <ListChecks size={14} /> 解析履歴
              </h3>
              <div className="max-h-56 overflow-y-auto space-y-3 no-scrollbar mask-fade-top">
                {history.slice(0, 5).map((item) => (
                  <div 
                    key={item.id} 
                    onClick={() => {
                      if (!loading && !showCamera) {
                        setCurrentResult(item.result);
                        setCurrentId(item.id);
                        setCurrentImageUrls(item.imageUrls);
                        // data:URLからbase64を抽出
                        const base64s = item.imageUrls.map(url => {
                          if (url.startsWith('data:')) {
                            return url.split(',')[1] || '';
                          }
                          return '';
                        }).filter(b => b);
                        setCurrentBase64Images(base64s);
                      }
                    }}
                    className={`bg-slate-900/95 backdrop-blur-2xl border border-slate-800 p-3 rounded-2xl flex items-center gap-4 shadow-2xl transition-all ${!loading && !showCamera ? 'cursor-pointer hover:border-blue-500 active:scale-[0.98]' : ''}`}
                  >
                    <img src={item.imageUrls[0]} className="w-14 h-14 rounded-xl object-cover bg-slate-800 border border-white/5" />
                    <div className="flex-grow min-w-0">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-black text-yellow-500 truncate">{item.result.licenseNumber || '----'}</span>
                        <span className="text-[10px] text-slate-500 font-bold">{new Date(item.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-xl font-black text-white">{item.result.estimatedTonnage.toFixed(1)}t</span>
                        <span className="text-xs font-bold text-slate-500 truncate">{item.result.truckType}</span>
                      </div>
                    </div>
                    <Activity size={16} className="text-blue-500 shrink-0 opacity-50" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>


      {/* コストダッシュボード */}
      <CostDashboard 
        isOpen={showCostDashboard} 
        onClose={() => { setShowCostDashboard(false); refreshCost(); }} 
      />

      {/* ストック一覧 */}
      {showStockList && (
        <StockList
          items={stockItems}
          onTag={(id, tag) => {
            updateStockItem(id, { tag });
            setStockItems(getStockItems());
          }}
          onUpdate={(id, updates) => {
            updateStockItem(id, updates);
            setStockItems(getStockItems());
          }}
          onDelete={(id) => {
            deleteStockItem(id);
            setStockItems(getStockItems());
          }}
          onAnalyze={(item) => {
            setShowStockList(false);
            setCurrentImageUrls(item.imageUrls);
            startAnalysis(item.base64Images, item.imageUrls);
          }}
          onClose={() => setShowStockList(false)}
        />
      )}

      {/* APIキー設定モーダル */}
      {showApiKeyModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-black text-white flex items-center gap-3">
                <Key className="text-yellow-500" size={24} />
                Gemini APIキー設定
              </h2>
              <button onClick={() => setShowApiKeyModal(false)} className="text-slate-500 hover:text-white">
                <X size={24} />
              </button>
            </div>
            
            <p className="text-sm text-slate-400 mb-4">
              Google AI StudioでAPIキーを取得してください。
            </p>
            
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="AIza..."
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 mb-4"
            />
            
            <div className="flex gap-3">
              <button
                onClick={handleSaveApiKey}
                disabled={!apiKeyInput.trim()}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-3 rounded-xl transition-all"
              >
                保存
              </button>
              <button
                onClick={() => setShowApiKeyModal(false)}
                className="px-6 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 rounded-xl transition-all"
              >
                キャンセル
              </button>
            </div>
            
            <a 
              href="https://aistudio.google.com/app/apikey" 
              target="_blank" 
              rel="noopener noreferrer"
              className="block text-center text-sm text-blue-400 hover:text-blue-300 mt-4"
            >
              Google AI Studioでキーを取得
            </a>
          </div>
        </div>
      )}

      <SyncSettings 
        isOpen={showSyncSettings} 
        onClose={() => setShowSyncSettings(false)} 
      />

      <footer className="bg-slate-950 border-t border-slate-900 p-4 text-center z-50">
        <p className="text-[10px] text-slate-600 font-black uppercase tracking-[0.3em]">
          トン数チェッカー AI v4.9
        </p>
      </footer>

      <style>{`
        @keyframes scan-vertical {
          0%, 100% { top: 0%; opacity: 0; }
          50% { top: 80%; opacity: 1; }
        }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .mask-fade-top {
          mask-image: linear-gradient(to top, black 80%, transparent 100%);
        }
      `}</style>
    </div>
  );
};

export default App;
