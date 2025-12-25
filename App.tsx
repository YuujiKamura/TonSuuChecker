
import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import ImageUploader from './components/ImageUploader';
import CameraCapture from './components/CameraCapture';
import CaptureChoice from './components/CaptureChoice';
import StockList from './components/StockList';
import ReportView from './components/ReportView';
import Settings from './components/Settings';
import ReferenceImageSettings from './components/ReferenceImageSettings';
import AnalysisResult from './components/AnalysisResult';
import CostDashboard from './components/CostDashboard';
import ApiKeySetup from './components/ApiKeySetup';
import { getStockItems, saveStockItem, updateStockItem, deleteStockItem, getTaggedItems, getHistoryItems, migrateLegacyHistory, addEstimation, getLatestEstimation } from './services/stockService';
import { getTodayCost, formatCost } from './services/costTracker';
import { initFromUrlParams } from './services/sheetSync';
import { analyzeGaraImageEnsemble, mergeResults, getApiKey, setApiKey, clearApiKey, isGoogleAIStudioKey, isQuotaError, QUOTA_ERROR_MESSAGE } from './services/geminiService';
import { EstimationResult, StockItem, ChatMessage } from './types';
import { RefreshCcw, Activity, AlertCircle, ZapOff, Archive, Settings as SettingsIcon, Truck, FileSpreadsheet } from 'lucide-react';

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
  const [ensembleTarget, setEnsembleTarget] = useState(() => {
    const saved = localStorage.getItem('tonchecker_ensemble_target');
    return saved ? parseInt(saved) : 1;
  });
  const [selectedModel, setSelectedModel] = useState<'gemini-3-flash-preview' | 'gemini-3-pro-preview'>(() => {
    const saved = localStorage.getItem('tonchecker_model');
    return (saved as 'gemini-3-flash-preview' | 'gemini-3-pro-preview') || 'gemini-3-flash-preview';
  });
  const [currentResult, setCurrentResult] = useState<EstimationResult | null>(null);
  const [rawInferences, setRawInferences] = useState<EstimationResult[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [currentImageUrls, setCurrentImageUrls] = useState<string[]>([]);
  const [currentBase64Images, setCurrentBase64Images] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [analysisStep, setAnalysisStep] = useState(0);
  
  // APIキー関連
  const [hasApiKey, setHasApiKey] = useState(false);
  const [isGoogleAIStudio, setIsGoogleAIStudio] = useState(false);
  const [showCostDashboard, setShowCostDashboard] = useState(false);
  const [todaysCost, setTodaysCost] = useState(0);

  // ストック・選択関連
  const [pendingCapture, setPendingCapture] = useState<{base64: string, url: string} | null>(null);
  const [showStockList, setShowStockList] = useState(false);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showReferenceSettings, setShowReferenceSettings] = useState(false);
  const [showApiKeySetup, setShowApiKeySetup] = useState(false);
  const [showReportView, setShowReportView] = useState(false);
  const [pendingAnalysis, setPendingAnalysis] = useState<{base64s: string[], urls: string[], capacity?: number} | null>(null);

  // 最大積載量
  const [maxCapacity, setMaxCapacity] = useState<number | undefined>(undefined);
  
  const requestCounter = useRef(0);
  const activeRequestId = useRef(0);

  // APIキーの状態を初期化時にチェック
  useEffect(() => {
    const apiKey = getApiKey();
    setHasApiKey(!!apiKey);
    
    // 既存のキーがあるが、ソースが不明な場合は確認を促す
    if (apiKey && !isGoogleAIStudioKey() && !localStorage.getItem('gemini_api_key_source')) {
      // ソースが不明な場合は、ユーザーに確認を求めるためにモーダルを表示
      // ただし、初回起動時は自動的に表示しない（ユーザーが設定を開いたときに確認）
    } else {
      setIsGoogleAIStudio(isGoogleAIStudioKey());
    }
    
    // 既存の履歴データをストックに移行（初回のみ）
    migrateLegacyHistory();
    
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
    "画像を解析準備中...",
    "車両データベースを検索中...",
    "メーカー・車種を特定中...",
    "ナンバーから積載量を推定中...",
    "荷台寸法を測定中...",
    "積載物・材質を判定中...",
    "重量を計算中...",
    "AI推論を統合中..."
  ];

  // 履歴はストックから取得（解析結果があるアイテム）
  const history = getHistoryItems();

  useEffect(() => {
    let interval: any;
    if (loading) {
      setAnalysisStep(0);
      interval = setInterval(() => {
        setAnalysisStep(prev => (prev < steps.length - 1 ? prev + 1 : prev));
      }, 1500);  // 8ステップ × 1.5秒 = 12秒
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


  // 解析開始の統一エントリーポイント
  const requestAnalysis = (base64s: string[], urls: string[], initialMaxCapacity?: number, stockItemId?: string) => {
    // ストックアイテムのIDを保存（既存アイテムの場合はaddEstimationを使用するため）
    if (stockItemId) {
      setCurrentId(stockItemId);
    }
    setMaxCapacity(initialMaxCapacity);

    // base64がない場合はimageUrlsから抽出（履歴移行データ対応）
    let firstBase64 = base64s[0];
    const firstUrl = urls[0];

    if (!firstBase64 && firstUrl && firstUrl.startsWith('data:')) {
      firstBase64 = firstUrl.split(',')[1] || '';
    }

    if (!firstBase64) {
      setError('画像データがありません。再撮影してください。');
      return;
    }

    setCurrentImageUrls([firstUrl]);
    setCurrentBase64Images([firstBase64]);
    setPendingCapture({ base64: firstBase64, url: firstUrl });
  };

  const startAnalysis = async (base64s: string[], urls: string[], isAuto: boolean = false, capacityOverride?: number, userFeedback?: ChatMessage[]) => {
    if (!hasApiKey) {
      // APIキー未設定時はセットアップ画面を表示し、解析を保留
      setPendingAnalysis({ base64s, urls, capacity: capacityOverride });
      setShowApiKeySetup(true);
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
        isAuto ? undefined : capacityOverride,  // capacityOverrideを直接使用（stateのフォールバックはしない）
        userFeedback  // ユーザーからの指摘・修正
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
            // 自動監視の場合は早期リターンしない（finallyでクリーンアップされる）
            return;
          }
          
          setIsTargetLocked(true);
          addLog(`ロックオン: 荷姿を検知`, 'success');
          await new Promise(r => setTimeout(r, 1500));
          // 自動監視の場合はここで処理を終了（finallyでクリーンアップされる）
          return;
        } else {
          if (!merged.isTargetDetected) {
            setError("トラックや荷姿が確認できません。撮り直してください。");
            // エラー時もfinallyでクリーンアップされる
            return;
          }
        }

        // currentIdが既に設定されている場合は既存のストックアイテムとして扱う
        const itemId = currentId || crypto.randomUUID();
        setCurrentResult(merged);
        setCurrentId(itemId);
        setRawInferences(results);
        setCurrentImageUrls(urls);
        
        // 解析結果をストックに保存（自動監視の場合は除く）
        if (!isAuto && base64s.length > 0 && merged.isTargetDetected) {
          try {
            const existingStock = getStockItems();
            let existingItem: StockItem | undefined;
            
            if (currentId) {
              // currentIdで既存アイテムを検索
              existingItem = existingStock.find(item => item.id === currentId);
            }
            
            if (!existingItem) {
              // currentIdがない場合は、画像URLで既存アイテムを検索
              existingItem = existingStock.find(item => 
                item.imageUrls.length === urls.length &&
                item.imageUrls[0] === urls[0]
              );
            }

            // 最大積載量: ユーザー指定 > AIの推定値（登録車両マッチ時）
            const effectiveMaxCapacity = capacityOverride || merged.estimatedMaxCapacity;

            if (existingItem) {
              // 既存のアイテムがある場合は、推定結果を追加（ランごとに履歴として保存）
              addEstimation(existingItem.id, merged);
              // maxCapacityが未設定でAIが推定した場合は更新
              if (!existingItem.maxCapacity && effectiveMaxCapacity) {
                updateStockItem(existingItem.id, { maxCapacity: effectiveMaxCapacity });
              }
            } else {
              // 新規アイテムの場合は作成
              const stockItem: StockItem = {
                id: itemId,
                timestamp: Date.now(),
                base64Images: base64s,
                imageUrls: urls,
                maxCapacity: effectiveMaxCapacity,  // ユーザー指定 or AI推定値
                result: merged, // 最新の推定結果（後方互換性）
                estimations: [merged], // 推定結果の履歴（ランごとに追加）
              };
              saveStockItem(stockItem);
            }
            setStockItems(getStockItems());
          } catch (err) {
            console.error('ストック追加エラー:', err);
            // ストック追加に失敗しても解析は続行
          }
        }
        
        refreshCost();
      }
    } catch (err: any) {
      if (activeRequestId.current !== requestId) return;
      if (isQuotaError(err)) {
        setIsRateLimited(true);
        addLog("Quota Limit reached. Slowing down...", 'error');
        if (!isAuto) setError(QUOTA_ERROR_MESSAGE);
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
    setMaxCapacity(undefined); // 最大積載量もリセット
    // 全てのモーダル・サブ画面を閉じる
    setShowCamera(false);
    setPendingCapture(null);
    setShowSettings(false);
    setShowCostDashboard(false);
    setShowStockList(false);
    setShowReferenceSettings(false);
    setShowApiKeySetup(false);
    setPendingAnalysis(null);
  };

  // APIキーセットアップ完了時
  const handleApiKeySetupComplete = (key: string, isStudio: boolean) => {
    setApiKey(key, isStudio);
    setHasApiKey(true);
    setIsGoogleAIStudio(isStudio);
    setShowApiKeySetup(false);

    // 保留中の解析があれば実行
    if (pendingAnalysis) {
      const { base64s, urls, capacity } = pendingAnalysis;
      setPendingAnalysis(null);
      startAnalysis(base64s, urls, false, capacity);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col font-sans text-slate-200">
      <Header
        onReset={resetAnalysis}
        costDisplay={formatCost(todaysCost)}
        isFreeTier={isGoogleAIStudio}
        onCostClick={() => setShowCostDashboard(true)}
      />
      
      <main className="flex-grow min-h-0 relative overflow-x-hidden overflow-y-auto">
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
            initialMaxCapacity={maxCapacity}
            source={currentId ? 'stock' : 'capture'}
            onAnalyze={(capacity) => {
              const { base64, url } = pendingCapture!;
              setPendingCapture(null);
              setMaxCapacity(capacity);
              setCurrentImageUrls([url]);
              setCurrentBase64Images([base64]);
              startAnalysis([base64], [url], false, capacity);
            }}
            onStock={currentId ? undefined : () => {
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
            onCancel={() => {
              setPendingCapture(null);
              setCurrentId(null); // ストックからの解析の場合、キャンセル時にIDをクリア
            }}
          />
        )}
        
        <div className="max-w-4xl mx-auto w-full px-4 pt-4">
            {/* ツールバー */}
            <div className="mb-4 flex items-center gap-2 sm:gap-3">
              <button
                onClick={() => setShowReportView(true)}
                className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full border text-sm font-bold bg-emerald-600 border-emerald-500 text-white hover:bg-emerald-500 transition-all"
              >
                <FileSpreadsheet size={16} />
                <span>集計表</span>
                <span className="bg-emerald-700 px-2 py-0.5 rounded-full text-xs">{stockItems.filter(i => i.manifestNumber || i.actualTonnage).length}</span>
              </button>
              <button
                onClick={() => setShowStockList(true)}
                className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full border text-sm font-bold bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 transition-all"
              >
                <Archive size={16} />
                <span className="hidden sm:inline">ストック</span>
                <span className="bg-slate-700 px-2 py-0.5 rounded-full text-xs">{stockItems.length}</span>
              </button>
              <button
                onClick={() => setShowReferenceSettings(true)}
                className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full border text-sm font-bold bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 transition-all"
              >
                <Truck size={16} />
                <span className="hidden sm:inline">車両</span>
              </button>
              <button
                onClick={() => setShowSettings(true)}
                className={`flex items-center gap-2 px-3 py-2 rounded-full border text-sm font-bold transition-all ml-auto ${
                  hasApiKey
                    ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                    : 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20 animate-pulse'
                }`}
                title={hasApiKey ? '設定' : 'APIキー未設定'}
              >
                <SettingsIcon size={18} />
              </button>
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
                  actualTonnage={getHistoryItems().find(h => h.id === currentId)?.actualTonnage}
                  initialChatHistory={getStockItems().find(i => i.id === currentId)?.chatHistory}
                  onSaveActualTonnage={(v) => {
                    if (currentId) {
                      updateStockItem(currentId, { actualTonnage: v });
                      setStockItems(getStockItems());
                    }
                  }}
                  onUpdateLicensePlate={(p, n) => {
                    if (currentId && currentResult) {
                      const updatedResult = { ...currentResult, licensePlate: p, licenseNumber: n };
                      // 最新の推定結果を更新
                      const item = getStockItems().find(i => i.id === currentId);
                      if (item && item.estimations && item.estimations.length > 0) {
                        // estimations配列の最新（先頭）を更新
                        const updatedEstimations = [...item.estimations];
                        updatedEstimations[0] = updatedResult;
                        updateStockItem(currentId, { result: updatedResult, estimations: updatedEstimations });
                      } else {
                        // 後方互換性のため、resultも更新
                        updateStockItem(currentId, { result: updatedResult });
                      }
                      setCurrentResult(updatedResult);
                      setStockItems(getStockItems());
                    }
                  }}
                  onUpdateChatHistory={(messages) => {
                    if (currentId) {
                      updateStockItem(currentId, { chatHistory: messages });
                      setStockItems(getStockItems());
                    }
                  }}
                  onReanalyzeWithFeedback={async (chatHistory) => {
                    if (!currentId || !currentBase64Images.length) return;
                    const item = getStockItems().find(i => i.id === currentId);
                    // 再解析を開始（指摘を含めて）
                    startAnalysis(currentBase64Images, currentImageUrls, false, item?.maxCapacity, chatHistory);
                  }}
                />
              </div>
            )}
          </div>

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
          onAdd={(item) => {
            saveStockItem(item);
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
            // 統一フロー：requestAnalysisを使用してCaptureChoiceを表示
            requestAnalysis(item.base64Images, item.imageUrls, item.maxCapacity, item.id);
          }}
          onViewResult={(item) => {
            // 解析結果ページを表示
            const latestEstimation = item.estimations && item.estimations.length > 0 
              ? item.estimations[0] 
              : item.result;
            if (latestEstimation) {
              setCurrentResult(latestEstimation);
              setCurrentId(item.id);
              setCurrentImageUrls(item.imageUrls);
              setCurrentBase64Images(item.base64Images);
              setShowStockList(false);
            }
          }}
          onClose={() => setShowStockList(false)}
        />
      )}

      {/* 帳票モード */}
      {showReportView && (
        <ReportView
          items={stockItems}
          onAdd={(item) => {
            saveStockItem(item);
            setStockItems(getStockItems());
          }}
          onUpdate={(id, updates) => {
            updateStockItem(id, updates);
            setStockItems(getStockItems());
          }}
          onDelete={(id) => {
            if (confirm('このエントリーを削除しますか？')) {
              deleteStockItem(id);
              setStockItems(getStockItems());
            }
          }}
          onClose={() => setShowReportView(false)}
          onAnalyze={(item) => {
            setShowReportView(false);
            requestAnalysis(item.base64Images, item.imageUrls, item.maxCapacity, item.id);
          }}
          onViewResult={(item) => {
            const latestEstimation = item.estimations && item.estimations.length > 0
              ? item.estimations[0]
              : item.result;
            if (latestEstimation) {
              setCurrentResult(latestEstimation);
              setCurrentId(item.id);
              setCurrentImageUrls(item.imageUrls);
              setCurrentBase64Images(item.base64Images);
              setShowReportView(false);
            }
          }}
        />
      )}

      {/* 設定モーダル */}
      <Settings
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
        ensembleTarget={ensembleTarget}
        onEnsembleChange={setEnsembleTarget}
        onApiKeyChange={(hasKey, isStudio) => {
          setHasApiKey(hasKey);
          setIsGoogleAIStudio(isStudio);
        }}
      />

      {/* 車両登録モーダル */}
      <ReferenceImageSettings
        isOpen={showReferenceSettings}
        onClose={() => setShowReferenceSettings(false)}
      />

      {/* APIキーセットアップ */}
      {showApiKeySetup && (
        <ApiKeySetup
          onComplete={handleApiKeySetupComplete}
          onCancel={() => {
            setShowApiKeySetup(false);
            setPendingAnalysis(null);
          }}
        />
      )}

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
