export type TruckType = '2t' | '4t' | '増トン' | '10t';
export type MaterialType = '土砂' | 'As殻' | 'Co殻' | '開粒度As殻' | '切削ガラ';

export interface EstimationResult {
  // Core (from prompt-spec.json)
  isTargetDetected: boolean;
  truckType: TruckType | string;
  licensePlate?: string;
  materialType: MaterialType | string;
  upperArea?: number;  // Deprecated (CLI版で削除済み、旧データ互換)
  height: number;
  slope?: number;  // Deprecated (CLI版で削除済み、旧データ互換)
  packingDensity: number;
  fillRatioL: number;
  fillRatioW: number;
  fillRatioZ: number;
  confidenceScore: number;
  reasoning: string;

  // Computed (code-side)
  estimatedVolumeM3: number;
  estimatedTonnage: number;

  // Web-only extensions
  tgTopY?: number;
  cargoTopY?: number;
  tgBotY?: number;
  taperRatio?: number;
  licenseNumber?: string;
  estimatedMaxCapacity?: number;
  maxCapacityReasoning?: string;
  materialBreakdown: MaterialBreakdown[];
  ensembleCount: number;

  // Profiling
  phaseTimings?: PhaseTiming[];

  // Deprecated (旧データ互換)
  frustumRatio?: number;
  voidRatio?: number;
  loadCondition?: string;
  chunkSize?: string;
  lowerArea?: number;
}

export interface MaterialBreakdown {
  material: string;
  percentage: number;
  density: number;
}

export interface AnalysisHistory {
  id: string;
  timestamp: number;
  imageUrls: string[];
  result: EstimationResult;
  actualTonnage?: number;
  description?: string;
}

export interface ExtractedFeature {
  parameterName: string;
  value: number | string;
  unit?: string;
  description: string;
  reference?: string;  // 基準（ナンバープレート幅基準など）
}

// チャットメッセージ（解析結果への指摘・質問）
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// 学習用フィードバック（将来の解析に反映される指摘）
export interface LearningFeedback {
  id: string;
  timestamp: number;
  // 元の解析情報
  originalStockId: string;  // 元のStockItemのID
  truckType?: string;  // 車両タイプ（関連する解析がある場合）
  materialType?: string;  // 材質タイプ
  // フィードバック内容
  feedbackType: 'correction' | 'insight' | 'rule';  // 訂正/知見/ルール
  summary: string;  // フィードバックの要約（AIプロンプトに含める用）
  originalMessages: ChatMessage[];  // 元のチャット履歴
  // 検証情報
  actualTonnage?: number;  // 実測重量（検証済みの場合）
  aiEstimation?: number;  // AI推定重量（訂正前）
  correctedEstimation?: number;  // 訂正後の推定重量（あれば）
}

export interface StockItem {
  id: string;
  timestamp: number;
  photoTakenAt?: number;  // EXIFから取得した撮影日時（Unixタイムスタンプ、ミリ秒）
  base64Images: string[];
  imageUrls: string[];
  actualTonnage?: number;  // ユーザー入力（実測）
  maxCapacity?: number;  // 最大積載量
  memo?: string;
  manifestNumber?: string;  // マニフェスト伝票番号（数字のみ）
  wasteType?: string;  // 廃棄物の種類（例: アスファルト殻）
  destination?: string;  // 搬出先（処理施設名）
  // AI抽出特徴
  extractedFeatures?: ExtractedFeature[];
  featureRawResponse?: string;  // AIの生レスポンス（デバッグ用）
  // 解析結果（履歴管理の統合）
  result?: EstimationResult;  // 最新の推定結果（後方互換性）
  estimations?: EstimationResult[];  // すべての推定結果の履歴（ランごとに追加）
  // ユーザーからの指摘・質問履歴
  chatHistory?: ChatMessage[];
}

// フェーズごとの所要時間
export interface PhaseTiming {
  label: string;
  durationMs: number;
}

// Box-overlay geometry-calibrated estimation result
export interface BoxOverlayResult {
  method: 'box-overlay';
  truckClass: string;
  materialType: string;
  tgTopY?: number;
  cargoTopY?: number;
  tgBotY?: number;
  heightM: number;
  fillRatioL: number;
  fillRatioW: number;
  taperRatio: number;
  packingDensity: number;
  estimatedVolumeM3: number;
  estimatedTonnage: number;
  density: number;
  reasoning: string;
  phaseTimings?: PhaseTiming[];
}

// --- AI response types (shared between boxOverlayService and analysisLog) ---

export interface GeometryResponse {
  plateBox?: number[];
  tailgateTopY?: number;
  tailgateBottomY?: number;
  cargoTopY?: number;
}

export interface FillResponse {
  fillRatioL?: number;
  fillRatioW?: number;
  taperRatio?: number;
  packingDensity?: number;
  materialType?: string;
  reasoning?: string;
}

// --- Analysis log types (全解析ログ保存) ---

export interface AnalysisLog {
  id: string;                    // crypto.randomUUID()
  stockItemId: string;           // 紐付くStockItemのID
  timestamp: number;

  // バージョン情報
  modelName: string;
  ensembleCount: number;

  // プロンプトスナップショット（変更追跡用）
  geometryPrompt: string;
  fillPrompt: string;

  // 各アンサンブルランの生データ
  geometryRuns: GeometryRunLog[];
  fillRuns: FillRunLog[];

  // 集約後の計算パラメータ
  calculation: CalculationLog;

  // 最終結果
  finalResult: BoxOverlayResult;

  // 画像情報
  imageInfo: ImageInfoLog;
}

export interface GeometryRunLog {
  runIndex: number;
  rawResponse: string;           // AIの生テキスト
  parsed: GeometryResponse | null;
  scaleMethod: string;           // "tailgate" | "plate" | "none"
  mPerNorm: number;
  cargoHeightM: number;
  durationMs: number;
}

export interface FillRunLog {
  runIndex: number;
  rawResponse: string;           // AIの生テキスト
  parsed: FillResponse | null;
  durationMs: number;
}

export interface CalculationLog {
  // 集約値（clamp/average後）
  heightM: number;
  fillRatioL: number;
  fillRatioW: number;
  taperRatio: number;
  packingDensity: number;        // AI値
  // 計算中間値
  effectiveL: number;
  effectiveW: number;
  volume: number;
  compressionFactor: number;
  effectivePacking: number;
  density: number;
  tonnage: number;
}

export interface ImageInfoLog {
  count: number;                 // 画像枚数
  totalSizeBytes: number;        // base64デコード後概算
  mimeType: string;
}

// Re-exports for backward compatibility
export type { AnalysisProgress, PartialCalcParams } from './types/ui';
