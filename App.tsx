import React, { useState, useCallback } from 'react';
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
import { saveStockItem, updateStockItem, deleteStockItem } from './services/stockService';
import { extractPhotoTakenAt } from './services/exifUtils';
import { formatCost } from './services/costTracker';
import { StockItem } from './types';
import useAppData from './hooks/useAppData';
import useAnalysis from './hooks/useAnalysis';
import { RefreshCcw, Activity, AlertCircle, ZapOff, Archive, Settings as SettingsIcon, Truck, FileSpreadsheet } from 'lucide-react';

const App: React.FC = () => {
  // --- Data & Settings ---
  const appData = useAppData();
  const {
    ensembleTarget, setEnsembleTarget,
    selectedModel, setSelectedModel,
    hasApiKey, setHasApiKey,
    isGoogleAIStudio, setIsGoogleAIStudio,
    todaysCost, refreshCost,
    storageUsed, storageQuota,
    stockItems, refreshStock,
  } = appData;

  // --- UI visibility (App.tsx owns these) ---
  const [showCostDashboard, setShowCostDashboard] = useState(false);
  const [showStockList, setShowStockList] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showReferenceSettings, setShowReferenceSettings] = useState(false);
  const [showApiKeySetup, setShowApiKeySetup] = useState(false);
  const [showReportView, setShowReportView] = useState(false);

  // --- Analysis engine ---
  const onReset = useCallback(() => {
    setShowSettings(false);
    setShowCostDashboard(false);
    setShowStockList(false);
    setShowReferenceSettings(false);
    setShowReportView(false);
  }, []);

  const analysis = useAnalysis({
    stockItems,
    hasApiKey,
    ensembleTarget,
    selectedModel,
    refreshStock,
    refreshCost,
    setShowApiKeySetup,
    setHasApiKey,
    setIsGoogleAIStudio,
    onReset,
  });

  const {
    loading, isTargetLocked, isRateLimited,
    currentId, setCurrentId,
    error, setError,
    analysisProgress, progressPercent, progressLog, elapsedSeconds,
    pendingCapture, setPendingCapture,
    showCamera, setShowCamera,
    currentResult, currentImageUrls, currentBase64Images,
    maxCapacity, setMaxCapacity,
    requestAnalysis, startAnalysis, resetAnalysis,
    handleSaveAsLearning, handleApiKeySetupComplete,
  } = analysis;

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col font-sans text-slate-200">
      <Header
        onReset={resetAnalysis}
        costDisplay={formatCost(todaysCost)}
        isFreeTier={isGoogleAIStudio}
        onCostClick={() => setShowCostDashboard(true)}
        storageUsed={storageUsed}
        storageQuota={storageQuota}
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
              startAnalysis([base64], [url], false, capacity);
            }}
            onStock={currentId ? undefined : async () => {
              const dataUrl = 'data:image/jpeg;base64,' + pendingCapture.base64;
              const photoTakenAt = await extractPhotoTakenAt(pendingCapture.base64);
              const newItem: StockItem = {
                id: crypto.randomUUID(),
                timestamp: Date.now(),
                photoTakenAt,
                base64Images: [pendingCapture.base64],
                imageUrls: [dataUrl],
              };
              await saveStockItem(newItem);
              await refreshStock();
              setPendingCapture(null);
            }}
            onCancel={() => {
              setPendingCapture(null);
              setCurrentId(null);
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
                  {/* 画像エリア */}
                  <div className={`relative aspect-video rounded-[2.5rem] overflow-hidden bg-slate-900 border-4 shadow-2xl transition-colors duration-500 ${isTargetLocked ? 'border-red-600' : 'border-slate-800'}`}>
                    {currentImageUrls[0] && (
                      <img
                        src={currentImageUrls[0]}
                        className="w-full h-full object-cover"
                        alt="Target"
                      />
                    )}

                    {/* スクリーン効果オーバーレイ */}
                    <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%)] bg-[length:100%_4px] pointer-events-none"></div>
                    <div className="absolute inset-0 overflow-hidden pointer-events-none">
                      <div className={`w-full h-20 bg-gradient-to-b from-transparent to-transparent absolute top-0 animate-[scan-vertical_3s_ease-in-out_infinite] ${isTargetLocked ? 'via-red-500/50' : 'via-blue-500/30'}`}></div>
                    </div>
                  </div>

                  {/* ステータステキストエリア（画像の下に分離配置） */}
                  <div className={`mt-4 p-6 rounded-3xl border shadow-2xl transition-all duration-500 ${isTargetLocked ? 'bg-red-950/80 border-red-500' : 'bg-slate-900/90 border-blue-500/30'}`}>
                    {/* モデル・推論回数表示 */}
                    <div className="flex items-center justify-center gap-3 mb-3 text-xs">
                      <span className="bg-slate-800 text-slate-300 px-2 py-1 rounded font-mono">
                        {selectedModel === 'gemini-3-pro-preview' ? 'PRO' : 'Flash'}
                      </span>
                      <span className="bg-slate-800 text-slate-300 px-2 py-1 rounded">
                        推論 x{ensembleTarget}
                      </span>
                    </div>
                    <div className="flex items-center justify-center gap-4 mb-4">
                      <Activity className={`${isTargetLocked ? 'text-red-500 animate-bounce' : 'text-blue-500 animate-pulse'}`} size={32} />
                      <div className="h-6 w-px bg-slate-700"></div>
                      <h2 className="text-lg md:text-2xl font-black tracking-widest text-white uppercase">
                        {isTargetLocked ? "TARGET LOCKED ON" : (analysisProgress?.detail || '解析中...')}
                      </h2>
                      <div className="h-6 w-px bg-slate-700"></div>
                      <span className="text-2xl font-mono font-bold text-yellow-500 tabular-nums">
                        {String(Math.floor(elapsedSeconds / 60)).padStart(2, '0')}:{String(elapsedSeconds % 60).padStart(2, '0')}
                      </span>
                    </div>
                    <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden mb-4">
                      <div
                        className={`h-full transition-all duration-500 ${isTargetLocked ? 'bg-red-500' : 'bg-blue-500'}`}
                        style={{ width: progressPercent }}
                      ></div>
                    </div>
                    {/* 進捗ログリスト */}
                    {progressLog.length > 0 && (
                      <div className="bg-slate-950/50 rounded-lg p-3 max-h-40 overflow-y-auto">
                        <div className="space-y-1 text-xs font-mono">
                          {progressLog.map((log, i) => {
                            const stepTime = i > 0 && log.elapsed !== undefined && progressLog[i-1].elapsed !== undefined
                              ? log.elapsed - (progressLog[i-1].elapsed || 0)
                              : 0;
                            return (
                              <div key={i} className={`flex items-center gap-2 ${i === progressLog.length - 1 ? 'text-blue-400' : 'text-slate-500'}`}>
                                <span className="text-slate-600 tabular-nums w-12">+{log.elapsed || 0}s</span>
                                {stepTime > 2 && <span className="text-yellow-500 text-[10px]">({stepTime}s)</span>}
                                {i === progressLog.length - 1 && <span className="animate-pulse">●</span>}
                                <span className="flex-1">{log.msg}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
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
                <AnalysisResult
                  result={currentResult}
                  imageUrls={currentImageUrls}
                  base64Images={currentBase64Images}
                  analysisId={currentId || ''}
                  actualTonnage={stockItems.find(h => h.id === currentId)?.actualTonnage}
                  maxCapacity={stockItems.find(h => h.id === currentId)?.maxCapacity}
                  initialChatHistory={stockItems.find(i => i.id === currentId)?.chatHistory}
                  onSaveActualTonnage={async (v) => {
                    if (currentId) {
                      await updateStockItem(currentId, { actualTonnage: v });
                      await refreshStock();
                    }
                  }}
                  onUpdateLicensePlate={async (p, n) => {
                    if (currentId && currentResult) {
                      const updatedResult = { ...currentResult, licensePlate: p, licenseNumber: n };
                      const item = stockItems.find(i => i.id === currentId);
                      if (item && item.estimations && item.estimations.length > 0) {
                        const updatedEstimations = [...item.estimations];
                        updatedEstimations[0] = updatedResult;
                        await updateStockItem(currentId, { result: updatedResult, estimations: updatedEstimations });
                      } else {
                        await updateStockItem(currentId, { result: updatedResult });
                      }
                      await refreshStock();
                    }
                  }}
                  onUpdateChatHistory={async (messages) => {
                    if (currentId) {
                      await updateStockItem(currentId, { chatHistory: messages });
                      await refreshStock();
                    }
                  }}
                  onReanalyzeWithFeedback={async (chatHistory) => {
                    if (!currentId || !currentBase64Images.length) return;
                    const item = stockItems.find(i => i.id === currentId);
                    startAnalysis(currentBase64Images, currentImageUrls, false, item?.maxCapacity, chatHistory);
                  }}
                  onReanalyzeWithoutFeedback={() => {
                    if (!currentId || !currentBase64Images.length) return;
                    const item = stockItems.find(i => i.id === currentId);
                    startAnalysis(currentBase64Images, currentImageUrls, false, item?.maxCapacity, undefined);
                  }}
                  onSaveAsLearning={handleSaveAsLearning}
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
          onAdd={async (item) => {
            await saveStockItem(item);
            await refreshStock();
          }}
          onUpdate={async (id, updates) => {
            await updateStockItem(id, updates);
            await refreshStock();
          }}
          onDelete={async (id) => {
            await deleteStockItem(id);
            await refreshStock();
          }}
          onAnalyze={(item) => {
            setShowStockList(false);
            requestAnalysis(item.base64Images, item.imageUrls, item.maxCapacity, item.id);
          }}
          onViewResult={(item) => {
            const latestItem = stockItems.find(s => s.id === item.id) ?? item;
            const latestEstimation = latestItem.estimations?.[0] ?? latestItem.result;
            if (latestEstimation) {
              analysis.viewStockItem(latestItem.id);
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
          onAdd={async (item) => {
            await saveStockItem(item);
            await refreshStock();
          }}
          onUpdate={async (id, updates) => {
            await updateStockItem(id, updates);
            await refreshStock();
          }}
          onDelete={async (id) => {
            if (confirm('このエントリーを削除しますか？')) {
              await deleteStockItem(id);
              await refreshStock();
            }
          }}
          onClose={() => setShowReportView(false)}
          onAnalyze={(item) => {
            setShowReportView(false);
            requestAnalysis(item.base64Images, item.imageUrls, item.maxCapacity, item.id);
          }}
          onViewResult={(item) => {
            const latestItem = stockItems.find(s => s.id === item.id) ?? item;
            const latestEstimation = latestItem.estimations?.[0] ?? latestItem.result;
            if (latestEstimation) {
              analysis.viewStockItem(latestItem.id);
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
        onDataChanged={() => {
          refreshStock();
          analysis.clearPendingState();
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
            analysis.setPendingAnalysis(null);
          }}
        />
      )}


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
