import { EstimationResult } from "../types";
import { calculateTonnage } from "./calculation";

// Default parameter values (prompt-spec.json mid-range)
const DEFAULT_FILL_RATIO = 0.85;
const DEFAULT_PACKING_DENSITY = 0.8;

/**
 * 配列から最頻値を取得する
 */
export function getMode<T>(arr: T[]): T {
  const filtered = arr.filter(v => v !== null && v !== undefined && v !== '');
  if (filtered.length === 0) return arr[0];
  const counts = filtered.reduce((acc, val) => {
    const key = String(val);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const modeKey = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
  return filtered.find(v => String(v) === modeKey) ?? arr[0];
}

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

  // Average new core parameters
  const avgUpperArea = validResults.reduce((sum, r) => sum + (r.upperArea ?? 0), 0) / resultCount;
  const avgHeight = validResults.reduce((sum, r) => sum + (r.height ?? 0), 0) / resultCount;
  const avgSlope = validResults.reduce((sum, r) => sum + (r.slope ?? 0), 0) / resultCount;
  const avgFillRatioL = validResults.reduce((sum, r) => sum + (r.fillRatioL ?? DEFAULT_FILL_RATIO), 0) / resultCount;
  const avgFillRatioW = validResults.reduce((sum, r) => sum + (r.fillRatioW ?? DEFAULT_FILL_RATIO), 0) / resultCount;
  const avgFillRatioZ = validResults.reduce((sum, r) => sum + (r.fillRatioZ ?? DEFAULT_FILL_RATIO), 0) / resultCount;
  const avgPackingDensity = validResults.reduce((sum, r) => sum + (r.packingDensity ?? DEFAULT_PACKING_DENSITY), 0) / resultCount;

  const finalTruckType = getMode(validResults.map(r => r.truckType));
  const finalMaterialType = getMode(validResults.map(r => r.materialType));
  const finalLicenseNumber = getMode(validResults.map(r => r.licenseNumber));
  const finalLicensePlate = getMode(validResults.map(r => r.licensePlate));
  const finalMaxCapacity = getMode(validResults.map(r => r.estimatedMaxCapacity));

  // Recalculate from averaged params (CLI版と同じ: パラメータ平均→再計算)
  const { volume, tonnage } = calculateTonnage({
    fillRatioW: avgFillRatioW,
    height: avgHeight,
    slope: avgSlope,
    fillRatioZ: avgFillRatioZ,
    packingDensity: avgPackingDensity,
    materialType: finalMaterialType,
  }, finalTruckType);

  const closestToAvg = validResults.reduce((prev, curr) =>
    Math.abs(curr.estimatedTonnage - tonnage) < Math.abs(prev.estimatedTonnage - tonnage) ? curr : prev
  );

  return {
    ...closestToAvg,
    isTargetDetected: true,
    truckType: finalTruckType,
    licensePlate: finalLicensePlate,
    licenseNumber: finalLicenseNumber,
    materialType: finalMaterialType,
    upperArea: Number(avgUpperArea.toFixed(3)),
    height: Number(avgHeight.toFixed(3)),
    slope: Number(avgSlope.toFixed(3)),
    fillRatioL: Number(avgFillRatioL.toFixed(3)),
    fillRatioW: Number(avgFillRatioW.toFixed(3)),
    fillRatioZ: Number(avgFillRatioZ.toFixed(3)),
    packingDensity: Number(avgPackingDensity.toFixed(3)),
    estimatedVolumeM3: volume,
    estimatedTonnage: tonnage,
    estimatedMaxCapacity: finalMaxCapacity ? Number(finalMaxCapacity) : closestToAvg.estimatedMaxCapacity,
    ensembleCount: count,
    reasoning: `【統合推論】有効サンプル:${resultCount}/${count}。${closestToAvg.reasoning}`
  };
}
