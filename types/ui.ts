// 推論中に段階的に埋まる計算パラメータ
export interface PartialCalcParams {
  heightM?: number;
  fillRatioL?: number;
  fillRatioW?: number;
  taperRatio?: number;
  packingDensity?: number;
  density?: number;
  estimatedVolumeM3?: number;
  estimatedTonnage?: number;
}

// 解析進捗の詳細状態
export interface AnalysisProgress {
  phase: 'preparing' | 'loading_references' | 'loading_stock' | 'inference' | 'geometry' | 'fill' | 'calculating' | 'merging' | 'done';
  detail: string;
  current?: number;  // 現在の推論回数
  total?: number;    // 目標推論回数
  params?: PartialCalcParams;  // 段階的に埋まる計算パラメータ
}
