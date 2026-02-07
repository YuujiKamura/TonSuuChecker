// CLI版 calculate_volume_and_tonnage() の忠実なTS移植
// 全定数は prompt-spec.json (SSOT) から取得
import { truckSpecs, calculation, getMaterialDensity } from '../domain/promptSpec.ts';

interface CoreParams {
  fillRatioW: number;
  height: number;
  slope: number;
  fillRatioZ: number;
  packingDensity: number;
  materialType: string;
}

export function calculateTonnage(params: CoreParams, truckClass?: string): { volume: number; tonnage: number } {
  const spec = truckClass ? truckSpecs[truckClass] : null;
  const bedArea = spec ? spec.bedLength * spec.bedWidth : calculation.defaultBedAreaM2;

  const upperAreaM2 = params.fillRatioW * bedArea;
  const effectiveHeight = Math.max(params.height - params.slope / 2, 0);
  const volume = (upperAreaM2 + bedArea) / 2 * effectiveHeight;

  const density = getMaterialDensity(params.materialType);
  const tonnage = volume * density * params.fillRatioZ * params.packingDensity;

  return {
    volume: Math.round(volume * 1000) / 1000,
    tonnage: Math.round(tonnage * 100) / 100,
  };
}
