import { EstimationResult } from "../types";

/**
 * 配列から最頻値を取得する
 */
export const getMode = (arr: any[]) => {
  const filtered = arr.filter(v => v !== null && v !== undefined && v !== '');
  if (filtered.length === 0) return arr[0];
  const counts = filtered.reduce((acc, val) => {
    acc[val] = (acc[val] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  return Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
};

/**
 * 複数の推論結果を統合（平均・最頻値マージ）する
 */
export function mergeResults(results: EstimationResult[]): EstimationResult {
  const count = results.length;
  if (count === 0) throw new Error("結果がありません");

  if (results.every(r => !r.isTargetDetected)) {
    return results[0];
  }

  const validResults = results.filter(r => r.isTargetDetected);
  const resultCount = validResults.length;

  const avgTonnage = validResults.reduce((sum, r) => sum + r.estimatedTonnage, 0) / resultCount;
  const avgVolume = validResults.reduce((sum, r) => sum + r.estimatedVolumeM3, 0) / resultCount;
  const avgFrustumRatio = validResults.reduce((sum, r) => sum + (r.frustumRatio ?? 1.0), 0) / resultCount;

  const finalTruckType = getMode(validResults.map(r => r.truckType));
  const finalLicenseNumber = getMode(validResults.map(r => r.licenseNumber));
  const finalLicensePlate = getMode(validResults.map(r => r.licensePlate));

  // 最大積載量は最頻値を採用
  const finalMaxCapacity = getMode(validResults.map(r => r.estimatedMaxCapacity));

  const closestToAvg = validResults.reduce((prev, curr) =>
    Math.abs(curr.estimatedTonnage - avgTonnage) < Math.abs(prev.estimatedTonnage - avgTonnage) ? curr : prev
  );

  return {
    ...closestToAvg,
    isTargetDetected: true,
    truckType: finalTruckType,
    licensePlate: finalLicensePlate,
    licenseNumber: finalLicenseNumber,
    estimatedTonnage: Number(avgTonnage.toFixed(2)),
    estimatedVolumeM3: Number(avgVolume.toFixed(2)),
    estimatedMaxCapacity: finalMaxCapacity ? Number(finalMaxCapacity) : closestToAvg.estimatedMaxCapacity,
    frustumRatio: Number(avgFrustumRatio.toFixed(2)),
    ensembleCount: count,
    reasoning: `【統合推論】有効サンプル:${resultCount}/${count}。${closestToAvg.reasoning}`
  };
}
