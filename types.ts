
export interface EstimationResult {
  isTargetDetected: boolean; // トラックおよび荷姿が検出されたか
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
