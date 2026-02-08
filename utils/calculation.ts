// WASM版 calculateTonnage - tonsuu-core から計算ロジックを呼び出す
import init, { calculateTonnage as wasmCalculate } from '../lib/tonsuu-core/tonsuu_core.js';

export interface CoreParams {
  fillRatioW: number;
  height: number;
  fillRatioZ: number;
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

export function calculateTonnage(params: CoreParams, truckClass?: string): { volume: number; tonnage: number } {
  const json = wasmCalculate(
    params.fillRatioW,
    params.height,
    params.fillRatioZ,
    params.packingDensity,
    params.materialType,
    truckClass ?? null,
  );
  return JSON.parse(json);
}
