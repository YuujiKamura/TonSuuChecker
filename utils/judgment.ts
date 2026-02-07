import { StockItem } from '../types';

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
