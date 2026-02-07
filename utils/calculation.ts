// Calculation constants from prompt-spec.json
// CLI版 calculate_volume_and_tonnage() の忠実なTS移植

const DEFAULT_BED_AREA_M2 = 6.8;

const TRUCK_SPECS: Record<string, { bedLength: number; bedWidth: number }> = {
  '2t': { bedLength: 3.0, bedWidth: 1.6 },
  '4t': { bedLength: 3.4, bedWidth: 2.06 },
  '増トン': { bedLength: 4.0, bedWidth: 2.2 },
  '10t': { bedLength: 5.3, bedWidth: 2.3 },
};

const MATERIAL_DENSITIES: Record<string, number> = {
  '土砂': 1.8,
  'As殻': 2.5,
  'Co殻': 2.5,
  '開粒度As殻': 2.35,
};

// Default density for unknown materials (As殻/Co殻 equivalent)
const DEFAULT_DENSITY = 2.5;

interface CoreParams {
  fillRatioW: number;
  height: number;
  slope: number;
  fillRatioZ: number;
  packingDensity: number;
  materialType: string;
}

export function calculateTonnage(params: CoreParams, truckClass?: string): { volume: number; tonnage: number } {
  const spec = truckClass ? TRUCK_SPECS[truckClass] : null;
  const bedArea = spec ? spec.bedLength * spec.bedWidth : DEFAULT_BED_AREA_M2;

  const upperAreaM2 = params.fillRatioW * bedArea;
  const effectiveHeight = Math.max(params.height - params.slope / 2, 0);
  const volume = (upperAreaM2 + bedArea) / 2 * effectiveHeight;

  const density = MATERIAL_DENSITIES[params.materialType] ?? DEFAULT_DENSITY;
  const tonnage = volume * density * params.fillRatioZ * params.packingDensity;

  return {
    volume: Math.round(volume * 1000) / 1000,
    tonnage: Math.round(tonnage * 100) / 100,
  };
}
