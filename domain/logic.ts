import { LOAD_GRADES, LoadGrade } from './specs.ts';

// 積載率から等級を取得
export const getLoadGrade = (actualTonnage: number, maxCapacity: number): LoadGrade => {
  const ratio = (actualTonnage / maxCapacity) * 100;
  return LOAD_GRADES.find(g => ratio >= g.minRatio && ratio < g.maxRatio) || LOAD_GRADES[LOAD_GRADES.length - 1];
};
