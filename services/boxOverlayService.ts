import { GoogleGenAI, Part } from "@google/genai";
import { saveCostEntry } from "./costTracker";
import { BoxOverlayResult, AnalysisProgress, PhaseTiming } from "../types";
import { PartialCalcParams } from "../types/ui";
import { getApiKey, checkIsFreeTier } from "./configService";
import { truckSpecs, materials } from "../domain/promptSpec";

// Default taper ratio fallback (used when AI doesn't return one).
// 1.0 = flat-top, 0.33 = sharp cone. Typical mound = 0.7-0.85.
const DEFAULT_TAPER_RATIO = 0.85;

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
  'Output ONLY JSON: {"fillRatioL": 0.0, "fillRatioW": 0.0, "taperRatio": 0.0, "packingDensity": 0.0, "reasoning": "..."} ' +
  "This is a rear view of a dump truck carrying construction debris (As殻 = asphalt chunks). " +
  "Estimate each parameter INDEPENDENTLY: " +
  "fillRatioL (0.3~0.9): fraction of the bed LENGTH occupied by cargo. " +
  "IMPORTANT: From a rear view, the bed length is NOT visible — you cannot judge how far cargo extends front-to-back. " +
  "If you cannot clearly determine fillRatioL from the image, set it to 0.9 (assume nearly full length). " +
  "Only reduce below 0.9 if there is clear visual evidence (e.g., side view showing empty space, or cargo obviously piled only in part of the bed). " +
  "fillRatioW (0.5~1.0): fraction of the bed WIDTH covered by cargo at the top surface. " +
  "Usually 0.8-1.0 since cargo spreads across the width. " +
  "taperRatio (0.3~1.0): mound shape factor from peak to edges. " +
  "Describes how the cargo cross-section tapers from the peak height down to the bed edges. " +
  "1.0 = flat top (cargo fills bed like a box, peak height is uniform). " +
  "0.7~0.85 = gentle mound (typical for bulk debris, slight slope from center). " +
  "0.5~0.7 = pronounced mound (peaked center, significant slope to sides). " +
  "0.3~0.5 = sharp peak (cone-like, small pile centered on bed). " +
  "packingDensity (0.65~0.9): how tightly packed the debris chunks are. " +
  "As殻 = flat asphalt pavement slabs (~5cm thick) that stack and interlock well, so packing is relatively high. " +
  "Loosely thrown with some gaps = 0.65-0.7, moderate = 0.7-0.8, tightly packed = 0.8-0.9.";

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
  taperRatio?: number;
  packingDensity?: number;
  reasoning?: string;
}

// --- Core functions ---

async function detectGeometry(
  ai: GoogleGenAI,
  imageParts: Part[],
  modelName: string,
  onFirstToken?: () => void,
): Promise<GeometryResponse> {
  const stream = await ai.models.generateContentStream({
    model: modelName,
    contents: {
      parts: [...imageParts, { text: GEOMETRY_PROMPT }],
    },
    config: {
      responseMimeType: "application/json",
      temperature: 0.2,
    },
  });

  let firstChunk = true;
  let fullText = "";
  for await (const chunk of stream) {
    if (firstChunk) {
      onFirstToken?.();
      firstChunk = false;
    }
    fullText += chunk.text ?? "";
  }

  if (!fullText) throw new Error("Geometry: APIレスポンスが空です");
  return parseJsonSafe<GeometryResponse>(fullText, "Geometry");
}

async function estimateFill(
  ai: GoogleGenAI,
  imageParts: Part[],
  modelName: string,
  onFirstToken?: () => void,
): Promise<FillResponse> {
  const stream = await ai.models.generateContentStream({
    model: modelName,
    contents: {
      parts: [...imageParts, { text: FILL_PROMPT }],
    },
    config: {
      responseMimeType: "application/json",
      temperature: 0.2,
    },
  });

  let firstChunk = true;
  let fullText = "";
  for await (const chunk of stream) {
    if (firstChunk) {
      onFirstToken?.();
      firstChunk = false;
    }
    fullText += chunk.text ?? "";
  }

  if (!fullText) throw new Error("Fill: APIレスポンスが空です");
  return parseJsonSafe<FillResponse>(fullText, "Fill");
}

function calculateBoxOverlay(
  heightM: number,
  fillL: number,
  fillW: number,
  taper: number,
  packing: number,
  truckClass: string,
  materialType: string,
): { volume: number; tonnage: number; density: number; bedLength: number; bedWidth: number } {
  const spec = truckSpecs[truckClass];
  if (!spec) throw new Error(`Unknown truck class: ${truckClass}`);
  const density = materials[materialType]?.density ?? 2.5;

  const volume = spec.bedLength * spec.bedWidth * heightM * fillL * fillW * taper;
  const tonnage = volume * density * packing;

  return { volume, tonnage, density, bedLength: spec.bedLength, bedWidth: spec.bedWidth };
}

// --- Helpers ---

/** APIレスポンスから最初のJSONオブジェクトを抽出してパースする */
function parseJsonSafe<T>(text: string, label: string): T {
  // まず素直にパース
  try {
    return JSON.parse(text) as T;
  } catch {
    // 失敗した場合：最初の { から対応する } までを抽出
    // 文字列リテラル内の {} はスキップする
    const start = text.indexOf('{');
    if (start === -1) throw new Error(`${label}: JSONオブジェクトが見つかりません`);
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\' && inString) { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      if (depth === 0) {
        const extracted = text.slice(start, i + 1);
        console.warn(`${label}: JSONに余分なテキストあり、抽出してパース (pos ${start}-${i})`);
        return JSON.parse(extracted) as T;
      }
    }
    throw new Error(`${label}: 不完全なJSONオブジェクト`);
  }
}

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

// 段階遷移の最小表示時間（ms）。瞬時に切り替わると読めないため。
const STAGE_MIN_DISPLAY_MS = 400;

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
  let lastNotifyTime = 0;
  const notify = async (progress: AnalysisProgress, wait = false) => {
    if (wait && lastNotifyTime > 0) {
      const elapsed = Date.now() - lastNotifyTime;
      if (elapsed < STAGE_MIN_DISPLAY_MS) {
        await new Promise(r => setTimeout(r, STAGE_MIN_DISPLAY_MS - elapsed));
      }
    }
    onDetailedProgress?.(progress);
    lastNotifyTime = Date.now();
  };

  // --- Phase timing profiler ---
  const timings: PhaseTiming[] = [];
  let phaseStart = Date.now();
  const startPhase = () => { phaseStart = Date.now(); };
  const endPhase = (label: string) => {
    timings.push({ label, durationMs: Date.now() - phaseStart });
  };

  // --- 段階的に埋まるパラメータ ---
  const partialParams: PartialCalcParams = {};

  await notify({ phase: "preparing", detail: "Box-overlay解析を準備中..." });
  startPhase();

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

    const runLabel = ensembleCount > 1 ? ` (${i + 1}/${ensembleCount})` : "";

    await notify({
      phase: "geometry",
      detail: `Gemini APIにリクエスト送信中...${runLabel}`,
      current: i + 1,
      total: ensembleCount,
    }, true);

    startPhase();
    try {
      const geo = await detectGeometry(ai, imageParts, modelName, () => {
        notify({
          phase: "geometry",
          detail: `モデル応答開始${runLabel} — 結果を受信中...`,
          current: i + 1,
          total: ensembleCount,
        });
      });
      await saveCostEntry(modelName, imageParts.length, isFreeTier);

      const plateBox = geo.plateBox;
      if (!plateBox || plateBox.length !== 4) {
        notify({
          phase: "geometry",
          detail: `幾何学検出${runLabel}: ナンバープレート未検出、スキップ`,
          current: i + 1,
          total: ensembleCount,
        });
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
        notify({
          phase: "geometry",
          detail: `幾何学検出${runLabel}: 後板位置が不正、スキップ`,
          current: i + 1,
          total: ensembleCount,
        });
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
      endPhase(`幾何学検出${runLabel}`);
      await notify({
        phase: "geometry",
        detail: `幾何学検出${runLabel}: 荷高=${cargoHeightM.toFixed(2)}m`,
        current: i + 1,
        total: ensembleCount,
      }, true);
      heightMList.push(cargoHeightM);
    } catch (err) {
      endPhase(`幾何学検出${runLabel} (エラー)`);
      notify({
        phase: "geometry",
        detail: `幾何学検出${runLabel}: エラー`,
        current: i + 1,
        total: ensembleCount,
      });
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

  // パラメータに荷高を反映
  partialParams.heightM = round3(heightM);
  const density = materials[material]?.density ?? 2.5;
  partialParams.density = density;
  await notify({
    phase: "geometry",
    detail: `荷高確定: ${heightM.toFixed(3)}m`,
    params: { ...partialParams },
  }, true);

  // Step 2: Estimate fill ratios (ensemble, average)
  const fillLList: number[] = [];
  const fillWList: number[] = [];
  const taperList: number[] = [];
  const packingList: number[] = [];
  let lastReasoning = "";

  for (let i = 0; i < ensembleCount; i++) {
    if (abortSignal?.cancelled) break;

    const fillRunLabel = ensembleCount > 1 ? ` (${i + 1}/${ensembleCount})` : "";

    await notify({
      phase: "fill",
      detail: `充填率推定 リクエスト送信中...${fillRunLabel}`,
      current: i + 1,
      total: ensembleCount,
    }, true);

    startPhase();
    try {
      const fill = await estimateFill(ai, imageParts, modelName, () => {
        notify({
          phase: "fill",
          detail: `モデル応答開始${fillRunLabel} — 結果を受信中...`,
          current: i + 1,
          total: ensembleCount,
        });
      });
      await saveCostEntry(modelName, imageParts.length, isFreeTier);

      const fl = fill.fillRatioL ?? 0.7;
      const fw = fill.fillRatioW ?? 0.8;
      const tp = fill.taperRatio ?? DEFAULT_TAPER_RATIO;
      const pd = fill.packingDensity ?? 0.7;

      endPhase(`充填率推定${fillRunLabel}`);
      await notify({
        phase: "fill",
        detail: `充填率推定${fillRunLabel}: L=${fl} W=${fw} T=${tp} P=${pd}`,
        current: i + 1,
        total: ensembleCount,
      }, true);

      console.log(`Fill run ${i + 1}: L=${fl}, W=${fw}, T=${tp}, p=${pd}`);

      fillLList.push(fl);
      fillWList.push(fw);
      taperList.push(tp);
      packingList.push(pd);
      if (fill.reasoning) {
        lastReasoning = fill.reasoning;
      }
    } catch (err) {
      endPhase(`充填率推定${fillRunLabel} (エラー)`);
      notify({
        phase: "fill",
        detail: `充填率推定${fillRunLabel}: エラー`,
        current: i + 1,
        total: ensembleCount,
      });
      console.error(`Fill run ${i + 1} error:`, err);
    }
  }

  if (fillLList.length === 0) {
    throw new Error("充填率推定が全ての試行で失敗しました");
  }

  const fillL = clamp(average(fillLList), 0.0, 0.9);
  const fillW = clamp(average(fillWList), 0.0, 1.0);
  const taper = clamp(average(taperList), 0.3, 1.0);
  const packing = clamp(average(packingList), 0.65, 0.9);

  // パラメータに充填率を反映
  partialParams.fillRatioL = round3(fillL);
  partialParams.fillRatioW = round3(fillW);
  partialParams.taperRatio = round3(taper);
  partialParams.packingDensity = round3(packing);
  await notify({
    phase: "fill",
    detail: `充填率確定: L=${fillL.toFixed(3)} W=${fillW.toFixed(3)} T=${taper.toFixed(3)} P=${packing.toFixed(3)}`,
    params: { ...partialParams },
  }, true);

  // Step 3: Calculate tonnage
  await notify({ phase: "calculating", detail: "体積・重量計算中...", params: { ...partialParams } }, true);
  startPhase();

  const calc = calculateBoxOverlay(heightM, fillL, fillW, taper, packing, truckClass, material);
  endPhase("計算");

  const result: BoxOverlayResult = {
    method: "box-overlay",
    truckClass,
    materialType: material,
    heightM: round3(heightM),
    fillRatioL: round3(fillL),
    fillRatioW: round3(fillW),
    taperRatio: round3(taper),
    packingDensity: round3(packing),
    estimatedVolumeM3: round4(calc.volume),
    estimatedTonnage: round2(calc.tonnage),
    density: calc.density,
    reasoning: lastReasoning,
    phaseTimings: timings,
  };

  // パラメータに最終結果を反映
  partialParams.estimatedVolumeM3 = round4(calc.volume);
  partialParams.estimatedTonnage = round2(calc.tonnage);

  onProgress?.(1, result);
  notify({ phase: "done", detail: "Box-overlay解析完了", params: { ...partialParams } });

  return result;
};
