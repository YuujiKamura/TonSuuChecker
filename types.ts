
export interface EstimationResult {
  isTargetDetected: boolean;
  truckType: string;
  licensePlate?: string;
  licenseNumber?: string;
  materialType: string;
  estimatedVolumeM3: number;
  estimatedTonnage: number;
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

export interface StockItem {
  id: string;
  timestamp: number;
  base64Images: string[];
  imageUrls: string[];
  tag?: 'OK' | 'NG';
  actualTonnage?: number;
  maxCapacity?: number;  // 最大積載量
  memo?: string;
  // AI抽出特徴
  extractedFeatures?: ExtractedFeature[];
  featureRawResponse?: string;  // AIの生レスポンス（デバッグ用）
}
