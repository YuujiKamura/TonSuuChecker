// 解析進捗の詳細状態
export interface AnalysisProgress {
  phase: 'preparing' | 'loading_references' | 'loading_stock' | 'inference' | 'geometry' | 'fill' | 'calculating' | 'merging' | 'done';
  detail: string;
  current?: number;  // 現在の推論回数
  total?: number;    // 目標推論回数
}
