import { GoogleGenAI, Part } from "@google/genai";
import { saveCostEntry } from "./costTracker";
import { BoxOverlayResult, AnalysisProgress } from "../types";
import { getApiKey, checkIsFreeTier } from "./configService";
import { truckSpecs, materials } from "../domain/promptSpec";

// Shape factor: peak height overestimates volume because cargo is mound-shaped.
// Empirical correction ~0.85 (between flat-top=1.0 and cone=0.33).
const SHAPE_FACTOR = 0.85;

// --- Prompts (from Rust estimate.rs) ---

const GEOMETRY_PROMPT =
  'Output ONLY JSON: {"plateBox":[x1,y1,x2,y2], "tailgateTopY": 0.0, "tailgateBottomY": 0.0, "cargoTopY": 0.0} ' +
  "This is a rear view of a dump truck carrying construction debris. " +
  "plateBox = bounding box of the rear license plate (normalized 0-1, [left,top,right,bottom]). " +
  "tailgateTopY = Y coordinate (normalized 0-1) of the TOP edge of the tailgate (後板上端/rim). " +
  "tailgateBottomY = Y coordinate (normalized 0-1) of the BOTTOM edge of the tailgate (後板下端). " +
  "cargoTopY = Y coordinate (normalized 0-1) of the HIGHEST point of the cargo pile. " +
  "The tailgate is the flat metal panel at the rear of the truck bed. " +
  "tailgateTopY < tailgateBottomY < plateBox[3] (top has smaller Y). " +
  "cargoTopY < tailgateTopY if cargo is heaped above the rim. " +
  "cargoTopY > tailgateTopY if cargo is below the rim. " +
  "All coordinates normalized 0.0-1.0.";

const FILL_PROMPT =
  'Output ONLY JSON: {"fillRatioL": 0.0, "fillRatioW": 0.0, "packingDensity": 0.0, "reasoning": "..."} ' +
  "This is a rear view of a dump truck carrying construction debris (As殻 = asphalt chunks). " +
  "Estimate each parameter INDEPENDENTLY: " +
  "fillRatioL (0.3~0.9): fraction of the bed LENGTH occupied by cargo. " +
  "Dump trucks are loaded from above; cargo forms a mound that rarely reaches the very front/rear. " +
  "Full load with cargo touching both ends = 0.85-0.9. Normal load = 0.6-0.8. Light load = 0.4-0.6. " +
  "fillRatioW (0.5~1.0): fraction of the bed WIDTH covered by cargo at the top surface. " +
  "Usually 0.8-1.0 since cargo spreads across the width. " +
  "packingDensity (0.5~0.9): how tightly packed the debris chunks are. " +
  "As殻 = asphalt pavement chunks (~5cm thick). " +
  "Large chunks thrown in loosely with visible gaps = 0.5-0.6, moderate = 0.65-0.7, tightly packed = 0.8-0.9.";

// --- Types for AI responses ---

interface GeometryResponse {
  plateBox?: number[];
  tailgateTopY?: number;
  tailgateBottomY?: number;
  cargoTopY?: number;
}

interface FillResponse {
  fillRatioL?: number;
  fillRatioW?: number;
  packingDensity?: number;
  reasoning?: string;
}

// --- Core functions ---

async function detectGeometry(
  ai: GoogleGenAI,
  imageParts: Part[],
  modelName: string
): Promise<GeometryResponse> {
  const response = await ai.models.generateContent({
    model: modelName,
    contents: {
      parts: [...imageParts, { text: GEOMETRY_PROMPT }],
    },
    config: {
      responseMimeType: "application/json",
      temperature: 0.2,
    },
  });

  const text = response.text;
  if (!text) throw new Error("Geometry: APIレスポンスが空です");
  return JSON.parse(text) as GeometryResponse;
}

async function estimateFill(
  ai: GoogleGenAI,
  imageParts: Part[],
  modelName: string
): Promise<FillResponse> {
  const response = await ai.models.generateContent({
    model: modelName,
    contents: {
      parts: [...imageParts, { text: FILL_PROMPT }],
    },
    config: {
      responseMimeType: "application/json",
      temperature: 0.2,
    },
  });

  const text = response.text;
  if (!text) throw new Error("Fill: APIレスポンスが空です");
  return JSON.parse(text) as FillResponse;
}

function calculateBoxOverlay(
  heightM: number,
  fillL: number,
  fillW: number,
  packing: number,
  truckClass: string,
  materialType: string,
): { volume: number; tonnage: number; density: number; bedLength: number; bedWidth: number } {
  const spec = truckSpecs[truckClass];
  if (!spec) throw new Error(`Unknown truck class: ${truckClass}`);
  const density = materials[materialType]?.density ?? 2.5;

  const volume = spec.bedLength * spec.bedWidth * heightM * fillL * fillW * SHAPE_FACTOR;
  const tonnage = volume * density * packing;

  return { volume, tonnage, density, bedLength: spec.bedLength, bedWidth: spec.bedWidth };
}

// --- Helpers ---

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function average(arr: number[]): number {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

// --- Main entry point ---

export const analyzeBoxOverlayEnsemble = async (
  base64Images: string[],
  ensembleCount: number = 2,
  truckClass: string = "4t",
  material: string = "As殻",
  onProgress?: (current: number, result: BoxOverlayResult) => void,
  abortSignal?: { cancelled: boolean },
  modelName: string = "gemini-3-flash-preview",
  onDetailedProgress?: (progress: AnalysisProgress) => void,
): Promise<BoxOverlayResult> => {
  const notify = (progress: AnalysisProgress) => {
    onDetailedProgress?.(progress);
  };

  notify({ phase: "preparing", detail: "Box-overlay解析を準備中..." });

  const apiKey = getApiKey();
  if (!apiKey) throw new Error("APIキーが設定されていません");
  const ai = new GoogleGenAI({ apiKey });
  const isFreeTier = checkIsFreeTier();

  const imageParts: Part[] = base64Images.map((base64) => ({
    inlineData: { mimeType: "image/jpeg" as const, data: base64 },
  }));

  const spec = truckSpecs[truckClass];
  if (!spec) throw new Error(`Unknown truck class: ${truckClass}`);

  // Step 1: Detect geometry (ensemble, take median of height_m)
  const heightMList: number[] = [];

  for (let i = 0; i < ensembleCount; i++) {
    if (abortSignal?.cancelled) break;

    notify({
      phase: "geometry",
      detail: ensembleCount > 1
        ? `幾何学検出中... (${i + 1}/${ensembleCount}回目)`
        : "幾何学検出中...",
      current: i + 1,
      total: ensembleCount,
    });

    try {
      const geo = await detectGeometry(ai, imageParts, modelName);
      await saveCostEntry(modelName, imageParts.length, isFreeTier);

      const plateBox = geo.plateBox;
      if (!plateBox || plateBox.length !== 4) {
        console.warn(`Geometry run ${i + 1}: plateBox not detected, skip`);
        continue;
      }

      const tgTop = geo.tailgateTopY ?? 0;
      const tgBot = geo.tailgateBottomY ?? 0;
      const cargoTop = geo.cargoTopY ?? 0;

      console.log(
        `Geometry run ${i + 1}: plate=${JSON.stringify(plateBox)}, tg_top=${tgTop.toFixed(3)}, tg_bot=${tgBot.toFixed(3)}, cargo_top=${cargoTop.toFixed(3)}`
      );

      if (tgTop <= 0 || tgBot <= 0 || tgTop >= tgBot) {
        console.warn(`Geometry run ${i + 1}: tailgate detection invalid, skip`);
        continue;
      }

      // Convert cargoTopY to height in meters above bed floor
      const tgHeightNorm = tgBot - tgTop;
      const mPerNorm = spec.bedHeight / tgHeightNorm;
      const cargoHeightNorm = tgBot - cargoTop;
      const cargoHeightM = clamp(cargoHeightNorm * mPerNorm, 0.0, 0.8);

      console.log(
        `  tg_h_norm=${tgHeightNorm.toFixed(4)}, m/norm=${mPerNorm.toFixed(3)}, cargo_h=${cargoHeightM.toFixed(3)}m`
      );
      heightMList.push(cargoHeightM);
    } catch (err) {
      console.error(`Geometry run ${i + 1} error:`, err);
    }
  }

  if (heightMList.length === 0) {
    throw new Error("幾何学検出が全ての試行で失敗しました");
  }

  const heightM = median(heightMList);
  console.log(
    `Height estimates: [${heightMList.map((h) => h.toFixed(3)).join(", ")}] -> median=${heightM.toFixed(3)}m`
  );

  // Step 2: Estimate fill ratios (ensemble, average)
  const fillLList: number[] = [];
  const fillWList: number[] = [];
  const packingList: number[] = [];
  let lastReasoning = "";

  for (let i = 0; i < ensembleCount; i++) {
    if (abortSignal?.cancelled) break;

    notify({
      phase: "fill",
      detail: ensembleCount > 1
        ? `充填率推定中... (${i + 1}/${ensembleCount}回目)`
        : "充填率推定中...",
      current: i + 1,
      total: ensembleCount,
    });

    try {
      const fill = await estimateFill(ai, imageParts, modelName);
      await saveCostEntry(modelName, imageParts.length, isFreeTier);

      const fl = fill.fillRatioL ?? 0.7;
      const fw = fill.fillRatioW ?? 0.8;
      const pd = fill.packingDensity ?? 0.7;

      console.log(`Fill run ${i + 1}: L=${fl}, W=${fw}, p=${pd}`);

      fillLList.push(fl);
      fillWList.push(fw);
      packingList.push(pd);
      if (fill.reasoning) {
        lastReasoning = fill.reasoning;
      }
    } catch (err) {
      console.error(`Fill run ${i + 1} error:`, err);
    }
  }

  if (fillLList.length === 0) {
    throw new Error("充填率推定が全ての試行で失敗しました");
  }

  const fillL = clamp(average(fillLList), 0.0, 1.0);
  const fillW = clamp(average(fillWList), 0.0, 1.0);
  const packing = clamp(average(packingList), 0.5, 0.9);

  // Step 3: Calculate tonnage
  notify({ phase: "calculating", detail: "体積・重量計算中..." });

  const calc = calculateBoxOverlay(heightM, fillL, fillW, packing, truckClass, material);

  const result: BoxOverlayResult = {
    method: "box-overlay",
    truckClass,
    materialType: material,
    heightM: round3(heightM),
    fillRatioL: round3(fillL),
    fillRatioW: round3(fillW),
    packingDensity: round3(packing),
    estimatedVolumeM3: round4(calc.volume),
    estimatedTonnage: round2(calc.tonnage),
    density: calc.density,
    reasoning: lastReasoning,
  };

  onProgress?.(1, result);
  notify({ phase: "done", detail: "Box-overlay解析完了" });

  return result;
};
