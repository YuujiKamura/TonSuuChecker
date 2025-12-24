
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
  confidenceScore: number;
  reasoning: string;
  ensembleCount: number;
  materialBreakdown: {
    material: string;
    percentage: number;
    density: number;
  }[];
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

export interface StockItem {
  id: string;
  timestamp: number;
  base64Images: string[];
  imageUrls: string[];
  actualTonnage?: number;  // ユーザー入力（実測）
  maxCapacity?: number;  // 最大積載量
  memo?: string;
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
