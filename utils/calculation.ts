// WASM版 calculateTonnage - tonsuu-core から計算ロジックを呼び出す
import init, { calculateTonnage as wasmCalculate } from '../lib/tonsuu-core/tonsuu_core.js';

export interface CoreParams {
  height: number;
  fillRatioL: number;
  fillRatioW: number;
  taperRatio: number;
  packingDensity: number;
  materialType: string;
}

let wasmReady: Promise<void> | null = null;

export function initWasm(): Promise<void> {
  if (!wasmReady) {
    wasmReady = init().then(() => {});
  }
  return wasmReady;
}

export function calculateTonnage(params: CoreParams, truckClass?: string): { volume: number; tonnage: number; effectivePacking: number; density: number } {
  const json = wasmCalculate(
    params.height,
    params.fillRatioL,
    params.fillRatioW,
    params.taperRatio,
    params.packingDensity,
    params.materialType,
    truckClass ?? null,
  );
  return JSON.parse(json);
}
