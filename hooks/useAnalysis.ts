import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { getStockItems, saveStockItem, updateStockItem, addEstimation, getTaggedItems } from '../services/stockService';
import { extractPhotoTakenAt } from '../services/exifUtils';
import { analyzeGaraImageEnsemble, mergeResults, setApiKey, isQuotaError, QUOTA_ERROR_MESSAGE } from '../services/geminiService';
import { saveLearningFeedback } from '../services/indexedDBService';
import { EstimationResult, StockItem, ChatMessage, LearningFeedback, AnalysisProgress } from '../types';

// 学習フィードバック要約の最大文字数
const FEEDBACK_SUMMARY_MAX_LENGTH = 200;

export interface LogEntry {
  id: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'system';
  timestamp: string;
}

export interface UseAnalysisParams {
  stockItems: StockItem[];
  hasApiKey: boolean;
  ensembleTarget: number;
  selectedModel: 'gemini-3-flash-preview' | 'gemini-3-pro-preview';
  refreshStock: () => Promise<void>;
  refreshCost: () => Promise<void>;
  setShowApiKeySetup: React.Dispatch<React.SetStateAction<boolean>>;
  setHasApiKey: React.Dispatch<React.SetStateAction<boolean>>;
  setIsGoogleAIStudio: React.Dispatch<React.SetStateAction<boolean>>;
  onReset?: () => void;
}

export interface UseAnalysisReturn {
  // State
  loading: boolean;
  isBackgroundScanning: boolean;
  isTargetLocked: boolean;
  isRateLimited: boolean;
  monitorGuidance: string | null;
  rawInferences: EstimationResult[];
  currentId: string | null;
  setCurrentId: React.Dispatch<React.SetStateAction<string | null>>;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  logs: LogEntry[];
  analysisProgress: AnalysisProgress | null;
  progressLog: { time: string; msg: string; elapsed?: number }[];
  elapsedSeconds: number;
  maxCapacity: number | undefined;
  pendingCapture: { base64: string; url: string } | null;
  setPendingCapture: React.Dispatch<React.SetStateAction<{ base64: string; url: string } | null>>;
  pendingAnalysis: { base64s: string[]; urls: string[]; capacity?: number } | null;
  setPendingAnalysis: React.Dispatch<React.SetStateAction<{ base64s: string[]; urls: string[]; capacity?: number } | null>>;
  showCamera: boolean;
  setShowCamera: React.Dispatch<React.SetStateAction<boolean>>;

  // Derived
  currentItem: StockItem | null;
  currentResult: EstimationResult | null;
  currentImageUrls: string[];
  currentBase64Images: string[];
  history: StockItem[];
  progressPercent: string;

  // Encapsulated state transitions
  viewStockItem: (itemId: string) => void;
  clearPendingState: () => void;
  setMaxCapacity: React.Dispatch<React.SetStateAction<number | undefined>>;

  // Functions
  addLog: (message: string, type?: LogEntry['type']) => void;
  requestAnalysis: (base64s: string[], urls: string[], initialMaxCapacity?: number, stockItemId?: string) => void;
  startAnalysis: (base64s: string[], urls: string[], isAuto?: boolean, capacityOverride?: number, userFeedback?: ChatMessage[]) => Promise<void>;
  resetAnalysis: () => void;
  handleSaveAsLearning: (chatHistory: ChatMessage[], result: EstimationResult) => Promise<void>;
  handleApiKeySetupComplete: (key: string, isStudio: boolean) => void;
}

export default function useAnalysis(params: UseAnalysisParams): UseAnalysisReturn {
  const {
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
  } = params;

  // --- State ---
  const [showCamera, setShowCamera] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isBackgroundScanning, setIsBackgroundScanning] = useState(false);
  const [isTargetLocked, setIsTargetLocked] = useState(false);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [monitorGuidance, setMonitorGuidance] = useState<string | null>(null);
  const [rawInferences, setRawInferences] = useState<EstimationResult[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [pendingResult, setPendingResult] = useState<EstimationResult | null>(null);
  const [pendingImageUrls, setPendingImageUrls] = useState<string[]>([]);
  const [pendingBase64Images, setPendingBase64Images] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress | null>(null);
  const [progressLog, setProgressLog] = useState<{time: string, msg: string, elapsed?: number}[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const analysisStartTime = useRef<number>(0);
  const [pendingCapture, setPendingCapture] = useState<{base64: string, url: string} | null>(null);
  const [pendingAnalysis, setPendingAnalysis] = useState<{base64s: string[], urls: string[], capacity?: number} | null>(null);
  const [maxCapacity, setMaxCapacity] = useState<number | undefined>(undefined);
  const requestCounter = useRef(0);
  const activeRequestId = useRef(0);

  // --- Derived state (useMemo) ---
  const currentItem = useMemo(() => {
    if (!currentId) return null;
    return stockItems.find(s => s.id === currentId) ?? null;
  }, [currentId, stockItems]);

  const currentResult = useMemo(() => {
    if (pendingResult) return pendingResult;
    if (!currentItem) return null;
    return currentItem.estimations?.[0] ?? currentItem.result ?? null;
  }, [pendingResult, currentItem]);

  const currentImageUrls = useMemo(() => {
    if (pendingImageUrls.length > 0) return pendingImageUrls;
    return currentItem?.imageUrls ?? [];
  }, [pendingImageUrls, currentItem]);

  const currentBase64Images = useMemo(() => {
    if (pendingBase64Images.length > 0) return pendingBase64Images;
    return currentItem?.base64Images ?? [];
  }, [pendingBase64Images, currentItem]);

  const history = useMemo(() =>
    stockItems.filter(item =>
      (item.estimations && item.estimations.length > 0) || item.result !== undefined
    ),
    [stockItems]
  );

  const progressPercent = useMemo(() => {
    if (isTargetLocked) return '100%';
    if (!analysisProgress) return '10%';
    const phaseWeights: Record<string, number> = {
      preparing: 10, loading_references: 20, loading_stock: 30,
      inference: 40, merging: 90, done: 100
    };
    const basePercent = phaseWeights[analysisProgress.phase] || 10;
    if (analysisProgress.phase === 'inference' && analysisProgress.total && analysisProgress.current) {
      const inferenceProgress = (analysisProgress.current / analysisProgress.total) * 50;
      return `${basePercent + inferenceProgress}%`;
    }
    return `${basePercent}%`;
  }, [analysisProgress, isTargetLocked]);

  // --- useEffects ---

  // loading開始時に進捗をリセット
  useEffect(() => {
    if (loading) {
      setProgressLog([]);
      setElapsedSeconds(0);
      analysisStartTime.current = Date.now();
      setAnalysisProgress({ phase: 'preparing', detail: '解析を開始中...' });
    } else {
      setAnalysisProgress(null);
    }
  }, [loading]);

  // 経過時間カウンター
  useEffect(() => {
    if (!loading) return;
    const timer = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [loading]);

  // --- Functions ---

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    const newLog: LogEntry = {
      id: crypto.randomUUID(),
      message,
      type,
      timestamp: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };
    setLogs(prev => [newLog, ...prev.slice(0, 49)]);
  }, []);

  // 解析開始の統一エントリーポイント
  const requestAnalysis = useCallback((base64s: string[], urls: string[], initialMaxCapacity?: number, stockItemId?: string) => {
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

    setPendingImageUrls([firstUrl]);
    setPendingBase64Images([firstBase64]);
    setPendingCapture({ base64: firstBase64, url: firstUrl });
  }, []);

  const startAnalysis = useCallback(async (base64s: string[], urls: string[], isAuto: boolean = false, capacityOverride?: number, userFeedback?: ChatMessage[]) => {
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
      setPendingResult(null);  // 解析開始時に pending をリセット
      setRawInferences([]);
      setPendingImageUrls(urls);
      setPendingBase64Images(base64s);
    }

    setError(null);
    addLog(isAuto ? `Motion Triggered: Analyzing...` : `推論開始 (x${ensembleTarget})`, isAuto ? 'info' : 'system');

    try {
      const abortSignal = { get cancelled() { return activeRequestId.current !== requestId; } };

      // 自動監視時は Lite モデル (gemini-flash-lite-latest) を優先
      const taggedItems = await getTaggedItems();
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
        taggedItems,
        isAuto ? undefined : capacityOverride,  // capacityOverrideを直接使用（stateのフォールバックはしない）
        userFeedback,  // ユーザーからの指摘・修正
        // 詳細な進捗通知
        !isAuto ? (progress) => {
          if (activeRequestId.current !== requestId) return;
          setAnalysisProgress(progress);
          const elapsed = Math.round((Date.now() - analysisStartTime.current) / 1000);
          const now = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          setProgressLog(prev => {
            // 同じメッセージは追加しない
            if (prev.length > 0 && prev[prev.length - 1].msg === progress.detail) return prev;
            return [...prev, { time: now, msg: progress.detail, elapsed }];
          });
        } : undefined
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
        setPendingResult(merged);  // 保存前の一時的な結果を pending に設定
        setCurrentId(itemId);
        setRawInferences(results);

        // 解析結果をストックに保存（自動監視の場合は除く）
        if (!isAuto && base64s.length > 0 && merged.isTargetDetected) {
          try {
            const existingStock = await getStockItems();
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
              await addEstimation(existingItem.id, merged);
              // maxCapacityを最新の推論結果で更新（再解析時は常に更新）
              if (effectiveMaxCapacity) {
                await updateStockItem(existingItem.id, { maxCapacity: effectiveMaxCapacity });
              }
              // 既存アイテムにphotoTakenAtがない場合は抽出を試みる
              if (!existingItem.photoTakenAt && base64s[0]) {
                const photoTakenAt = await extractPhotoTakenAt(base64s[0]);
                if (photoTakenAt) {
                  await updateStockItem(existingItem.id, { photoTakenAt });
                }
              }
            } else {
              // 新規アイテムの場合は作成
              // EXIFから撮影日時を抽出
              const photoTakenAt = base64s[0] ? await extractPhotoTakenAt(base64s[0]) : undefined;
              const stockItem: StockItem = {
                id: itemId,
                timestamp: Date.now(),
                photoTakenAt,  // EXIFから取得した撮影日時
                base64Images: base64s,
                imageUrls: urls,
                maxCapacity: effectiveMaxCapacity,  // ユーザー指定 or AI推定値
                result: merged, // 最新の推定結果（後方互換性）
                estimations: [merged], // 推定結果の履歴（ランごとに追加）
              };
              await saveStockItem(stockItem);
            }
            await refreshStock();
          } catch (err) {
            console.error('ストック追加エラー:', err);
            // ストック追加に失敗しても解析は続行
          }
        }

        refreshCost();
      }
    } catch (err: any) {
      if (activeRequestId.current !== requestId) return;
      const message = err?.message || '';
      // err.message だけでなく toString() も検査（ApiError は JSON を含む場合がある）
      const fullError = String(err);

      if (isQuotaError(err)) {
        setIsRateLimited(true);
        addLog("Quota Limit reached. Slowing down...", 'error');
        if (!isAuto) setError(QUOTA_ERROR_MESSAGE);
      } else if (fullError.includes('API_KEY_INVALID') || message.includes('API key not valid') || message.includes('API key expired')) {
        addLog(`Error: Invalid API Key`, 'error');
        if (!isAuto) setError('APIキーが無効または期限切れです。設定から新しいキーを入力してください。');
      } else if (message.includes('INVALID_ARGUMENT') || (message.includes('400') && !fullError.includes('API_KEY'))) {
        addLog(`Error: ${message}`, 'error');
        if (!isAuto) setError('画像データが不正です。再撮影してください。');
      } else if (message.includes('fetch') || message.includes('network') || message.includes('Failed to fetch')) {
        addLog(`Error: Network error`, 'error');
        if (!isAuto) setError('ネットワークエラーです。接続を確認してください。');
      } else {
        addLog(`Error: ${message}`, 'error');
        if (!isAuto) setError(`エラー: ${message}`);
      }
    } finally {
      if (activeRequestId.current === requestId) {
        setLoading(false);
        setIsBackgroundScanning(false);
        setIsTargetLocked(false);
      }
    }
  }, [hasApiKey, ensembleTarget, selectedModel, history, currentId, refreshStock, refreshCost, addLog, setShowApiKeySetup]);

  const resetAnalysis = useCallback(() => {
    activeRequestId.current = 0;
    setCurrentId(null);
    // pending state をクリア（currentResult, currentImageUrls, currentBase64Images は useMemo で派生）
    setPendingResult(null);
    setPendingImageUrls([]);
    setPendingBase64Images([]);
    setRawInferences([]);
    setError(null);
    setLoading(false);
    setIsBackgroundScanning(false);
    setIsTargetLocked(false);
    setMonitorGuidance(null);
    setMaxCapacity(undefined); // 最大積載量もリセット
    // 自身が管理するモーダル・サブ画面を閉じる
    setShowCamera(false);
    setPendingCapture(null);
    setShowApiKeySetup(false);
    setPendingAnalysis(null);
    // 外部のモーダル状態をリセット（App.tsx が提供するコールバック）
    onReset?.();
  }, [onReset, setShowApiKeySetup]);

  // APIキーセットアップ完了時
  const handleApiKeySetupComplete = useCallback((key: string, isStudio: boolean) => {
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
  }, [pendingAnalysis, startAnalysis, setHasApiKey, setIsGoogleAIStudio, setShowApiKeySetup]);

  // チャット履歴を学習データとして保存
  const handleSaveAsLearning = useCallback(async (chatHistory: ChatMessage[], result: EstimationResult) => {
    if (!currentId || chatHistory.length === 0) return;

    try {
      // チャット履歴から要約を生成（ユーザーの指摘を抽出）
      const userMessages = chatHistory.filter(m => m.role === 'user');
      const summary = userMessages.map(m => m.content).join(' → ');

      // 実測値があるかどうかで訂正かどうかを判定
      const stockItem = stockItems.find(i => i.id === currentId);
      const feedbackType: LearningFeedback['feedbackType'] =
        stockItem?.actualTonnage ? 'correction' : 'insight';

      const feedback: LearningFeedback = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        originalStockId: currentId,
        truckType: result.truckType,
        materialType: result.materialType,
        feedbackType,
        summary: summary.length > FEEDBACK_SUMMARY_MAX_LENGTH ? summary.slice(0, FEEDBACK_SUMMARY_MAX_LENGTH) + '...' : summary,
        originalMessages: chatHistory,
        actualTonnage: stockItem?.actualTonnage,
        aiEstimation: result.estimatedTonnage,
      };

      await saveLearningFeedback(feedback);
      addLog('学習データを保存しました', 'success');
    } catch (err: any) {
      addLog(`学習データ保存エラー: ${err?.message || '不明なエラー'}`, 'error');
      throw err;  // 上位コンポーネントにも伝播
    }
  }, [currentId, stockItems, addLog]);

  // 既存のストックアイテムを結果表示用に選択
  const viewStockItem = useCallback((itemId: string) => {
    setPendingResult(null);
    setPendingImageUrls([]);
    setPendingBase64Images([]);
    setCurrentId(itemId);
  }, []);

  // pending状態をクリアして初期状態に戻す
  const clearPendingState = useCallback(() => {
    setPendingResult(null);
    setPendingImageUrls([]);
    setPendingBase64Images([]);
    setCurrentId(null);
  }, []);

  return {
    // State
    loading,
    isBackgroundScanning,
    isTargetLocked,
    isRateLimited,
    monitorGuidance,
    rawInferences,
    currentId,
    setCurrentId,
    error,
    setError,
    logs,
    analysisProgress,
    progressLog,
    elapsedSeconds,
    maxCapacity,
    pendingCapture,
    setPendingCapture,
    pendingAnalysis,
    setPendingAnalysis,
    showCamera,
    setShowCamera,

    // Derived
    currentItem,
    currentResult,
    currentImageUrls,
    currentBase64Images,
    history,
    progressPercent,

    // Encapsulated state transitions
    viewStockItem,
    clearPendingState,
    setMaxCapacity,

    // Functions
    addLog,
    requestAnalysis,
    startAnalysis,
    resetAnalysis,
    handleSaveAsLearning,
    handleApiKeySetupComplete,
  };
}
