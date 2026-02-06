
export interface EstimationResult {
  isTargetDetected: boolean;
  truckType: string;
  licensePlate?: string;
  licenseNumber?: string;
  materialType: string;
  estimatedVolumeM3: number;
  estimatedTonnage: number;
  estimatedMaxCapacity?: number;  // AIが見た目から推定した最大積載量(トン)
  maxCapacityReasoning?: string;  // 最大積載量の推定根拠
  frustumRatio?: number;  // 錐台形状に対する充填割合 (0.3~1.0)
  confidenceScore: number;
  reasoning: string;
  ensembleCount: number;
  materialBreakdown: {
    material: string;
    percentage: number;
    density: number;
  }[];
  // 積載状態と計算パラメータ
  loadCondition?: string;     // 積載状態（すり切り/軽い山盛り/山盛り/高い山盛り）
  chunkSize?: string;         // 塊サイズ（細かい/普通/大きい）→空隙率判定の根拠
  lowerArea?: number;         // 底面積 (m²)
  upperArea?: number;         // 上面積 (m²)
  height?: number;            // 積載高さ (m)
  voidRatio?: number;         // 適用した空隙率
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

// 判定状態を導出（actualTonnageとmaxCapacityから計算）
export type JudgmentStatus = 'OK' | 'NG' | 'unknown';

export const getJudgmentStatus = (item: StockItem): JudgmentStatus => {
  if (item.actualTonnage === undefined || item.maxCapacity === undefined) {
    return 'unknown';
  }
  return item.actualTonnage <= item.maxCapacity ? 'OK' : 'NG';
};

export const isJudged = (item: StockItem): boolean => {
  return item.actualTonnage !== undefined && item.maxCapacity !== undefined;
};

// 解析進捗の詳細状態
export interface AnalysisProgress {
  phase: 'preparing' | 'loading_references' | 'loading_stock' | 'inference' | 'merging' | 'done';
  detail: string;
  current?: number;  // 現在の推論回数
  total?: number;    // 目標推論回数
}
