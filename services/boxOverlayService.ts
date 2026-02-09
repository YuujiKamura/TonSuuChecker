import { GoogleGenAI, Part } from "@google/genai";
import { saveCostEntry } from "./costTracker";
import { BoxOverlayResult, AnalysisProgress, PhaseTiming, GeometryResponse, FillResponse, AnalysisLog, GeometryRunLog, FillRunLog, CalculationLog, ImageInfoLog } from "../types";
import { PartialCalcParams } from "../types/ui";
import { getApiKey, checkIsFreeTier } from "./configService";
import { truckSpecs, materials } from "../domain/promptSpec";
import { saveAnalysisLog } from "./indexedDBService";
import {
  calculateTonnage as wasmCalculateTonnage,
  heightFromGeometry as wasmHeightFromGeometry,
  parseGeometry as wasmParseGeometry,
  parseFill as wasmParseFill,
} from '../lib/tonsuu-core/tonsuu_core.js';
import spec from '../prompt-spec.json';

// --- Prompts (from prompt-spec.json SSOT) ---

export const GEOMETRY_PROMPT: string = spec.geometryPrompt;
export const FILL_PROMPT: string = spec.fillPrompt;

// --- Ranges & constants from prompt-spec.json ---
const ranges = spec.ranges;
const constants = spec.constants;

// --- Core functions ---

async function detectGeometry(
  ai: GoogleGenAI,
  imageParts: Part[],
  modelName: string,
  onFirstToken?: () => void,
): Promise<{ parsed: GeometryResponse; rawText: string }> {
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
  const wasmResult = JSON.parse(wasmParseGeometry(fullText));
  if (!wasmResult.ok) throw new Error(`Geometry: ${wasmResult.error}`);
  const parsed: GeometryResponse = {
    plateBox: wasmResult.plateBox,
    tailgateTopY: wasmResult.tailgateTopY,
    tailgateBottomY: wasmResult.tailgateBottomY,
    cargoTopY: wasmResult.cargoTopY,
  };
  return { parsed, rawText: fullText };
}

async function estimateFill(
  ai: GoogleGenAI,
  imageParts: Part[],
  modelName: string,
  onFirstToken?: () => void,
): Promise<{ parsed: FillResponse; rawText: string }> {
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
  const wasmResult = JSON.parse(wasmParseFill(fullText));
  if (!wasmResult.ok) throw new Error(`Fill: ${wasmResult.error}`);
  const parsed: FillResponse = {
    fillRatioL: wasmResult.fillRatioL,
    fillRatioW: wasmResult.fillRatioW,
    taperRatio: wasmResult.taperRatio,
    packingDensity: wasmResult.packingDensity,
    reasoning: wasmResult.reasoning,
  };
  return { parsed, rawText: fullText };
}

/** WASM経由でbox-overlay計算を実行し、CalculationLog付きの結果を返す */
function calculateBoxOverlay(
  heightM: number,
  fillL: number,
  fillW: number,
  taper: number,
  packing: number,
  truckClass: string,
  materialType: string,
): { volume: number; tonnage: number; density: number; effectivePacking: number; calculationLog: CalculationLog } {
  const truckSpec = truckSpecs[truckClass];
  if (!truckSpec) throw new Error(`Unknown truck class: ${truckClass}`);

  // Call WASM calculateTonnage
  const wasmResult = JSON.parse(
    wasmCalculateTonnage(heightM, fillL, fillW, taper, packing, materialType, truckClass)
  ) as { volume: number; tonnage: number; effectivePacking: number; density: number };

  // Reconstruct intermediate values for calculationLog
  const effectiveL = fillL * taper;
  const effectiveW = (constants.BOTTOM_FILL + fillW) / 2;
  const compressionFactor = 1.0 + constants.COMPRESSION_FACTOR * (wasmResult.volume - constants.COMPRESSION_REF_VOLUME);

  const calculationLog: CalculationLog = {
    heightM,
    fillRatioL: fillL,
    fillRatioW: fillW,
    taperRatio: taper,
    packingDensity: packing,
    effectiveL,
    effectiveW,
    volume: wasmResult.volume,
    compressionFactor,
    effectivePacking: wasmResult.effectivePacking,
    density: wasmResult.density,
    tonnage: wasmResult.tonnage,
  };

  return {
    volume: wasmResult.volume,
    tonnage: wasmResult.tonnage,
    density: wasmResult.density,
    effectivePacking: wasmResult.effectivePacking,
    calculationLog,
  };
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
  stockItemId?: string,
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

  const truckSpec = truckSpecs[truckClass];
  if (!truckSpec) throw new Error(`Unknown truck class: ${truckClass}`);

  // Step 1: Detect geometry (ensemble, take median of height_m)
  const heightMList: number[] = [];
  const geometryRunLogs: GeometryRunLog[] = [];

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
      const { parsed: geo, rawText: geoRawText } = await detectGeometry(ai, imageParts, modelName, () => {
        notify({
          phase: "geometry",
          detail: `モデル応答開始${runLabel} — 結果を受信中...`,
          current: i + 1,
          total: ensembleCount,
        });
      });
      await saveCostEntry(modelName, imageParts.length, isFreeTier);

      const plateBox = geo.plateBox;
      const tgTop = geo.tailgateTopY ?? 0;
      const tgBot = geo.tailgateBottomY ?? 0;
      const cargoTop = geo.cargoTopY ?? 0;

      console.log(
        `Geometry run ${i + 1}: plate=${JSON.stringify(plateBox)}, tg_top=${tgTop.toFixed(3)}, tg_bot=${tgBot.toFixed(3)}, cargo_top=${cargoTop.toFixed(3)}`
      );

      if (tgTop <= 0) {
        notify({
          phase: "geometry",
          detail: `幾何学検出${runLabel}: 後板上端が不正、スキップ`,
          current: i + 1,
          total: ensembleCount,
        });
        console.warn(`Geometry run ${i + 1}: tailgateTopY invalid, skip`);
        const runDuration = Date.now() - phaseStart;
        geometryRunLogs.push({ runIndex: i, rawResponse: geoRawText, parsed: geo, scaleMethod: "none", mPerNorm: 0, cargoHeightM: 0, durationMs: runDuration });
        continue;
      }

      // WASM heightFromGeometry handles scale calculation (tailgate priority, plate fallback)
      const plateBoxJson = plateBox && plateBox.length === 4 ? JSON.stringify(plateBox) : null;
      const geoResult = JSON.parse(
        wasmHeightFromGeometry(tgTop, tgBot, cargoTop, plateBoxJson, truckSpec.bedHeight)
      ) as { heightM: number; scaleMethod: string };

      let cargoHeightM = geoResult.heightM;
      const scaleMethod = geoResult.scaleMethod;
      let mPerNorm = 0;

      if (scaleMethod === "none") {
        notify({
          phase: "geometry",
          detail: `幾何学検出${runLabel}: スケール基準なし、スキップ`,
          current: i + 1,
          total: ensembleCount,
        });
        console.warn(`Geometry run ${i + 1}: no scale reference, skip`);
        const runDuration = Date.now() - phaseStart;
        geometryRunLogs.push({ runIndex: i, rawResponse: geoRawText, parsed: geo, scaleMethod: "none", mPerNorm: 0, cargoHeightM: 0, durationMs: runDuration });
        continue;
      }

      // Reconstruct mPerNorm for logging
      if (scaleMethod === "tailgate") {
        const tgHeightNorm = tgBot - tgTop;
        mPerNorm = tgHeightNorm > 0 ? truckSpec.bedHeight / tgHeightNorm : 0;
      } else {
        const plateHeightNorm = plateBox && plateBox.length === 4 ? plateBox[3] - plateBox[1] : 0;
        mPerNorm = plateHeightNorm > 0 ? constants.PLATE_HEIGHT_M / plateHeightNorm : 0;
      }

      console.log(`  scale=${scaleMethod}, m/norm=${mPerNorm.toFixed(2)}, H=${cargoHeightM.toFixed(3)}m`);

      // ジオメトリ生座標をパラメータに反映
      partialParams.tgTopY = round3(tgTop);
      partialParams.cargoTopY = round3(cargoTop);
      partialParams.tgBotY = round3(tgBot);

      endPhase(`幾何学検出${runLabel}`);
      const runDuration = timings[timings.length - 1].durationMs;
      geometryRunLogs.push({ runIndex: i, rawResponse: geoRawText, parsed: geo, scaleMethod, mPerNorm, cargoHeightM, durationMs: runDuration });
      await notify({
        phase: "geometry",
        detail: `幾何学検出${runLabel}: 荷高=${cargoHeightM.toFixed(2)}m [${scaleMethod}]`,
        current: i + 1,
        total: ensembleCount,
        params: { ...partialParams },
      }, true);
      heightMList.push(cargoHeightM);
    } catch (err) {
      endPhase(`幾何学検出${runLabel} (エラー)`);
      const runDuration = timings[timings.length - 1].durationMs;
      geometryRunLogs.push({ runIndex: i, rawResponse: "", parsed: null, scaleMethod: "none", mPerNorm: 0, cargoHeightM: 0, durationMs: runDuration });
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
  const fillRunLogs: FillRunLog[] = [];

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
      const { parsed: fill, rawText: fillRawText } = await estimateFill(ai, imageParts, modelName, () => {
        notify({
          phase: "fill",
          detail: `モデル応答開始${fillRunLabel} — 結果を受信中...`,
          current: i + 1,
          total: ensembleCount,
        });
      });
      await saveCostEntry(modelName, imageParts.length, isFreeTier);

      const fl = fill.fillRatioL ?? 0.8;
      const fw = fill.fillRatioW ?? 0.7;
      const tp = fill.taperRatio ?? 0.85;
      const pd = fill.packingDensity ?? 0.7;

      endPhase(`充填率推定${fillRunLabel}`);
      const fillDuration = timings[timings.length - 1].durationMs;
      fillRunLogs.push({ runIndex: i, rawResponse: fillRawText, parsed: fill, durationMs: fillDuration });
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
      const fillDuration = timings[timings.length - 1].durationMs;
      fillRunLogs.push({ runIndex: i, rawResponse: "", parsed: null, durationMs: fillDuration });
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

  const fillL = clamp(average(fillLList), ranges.fillRatioL.min, ranges.fillRatioL.max);
  const fillW = clamp(average(fillWList), ranges.fillRatioW.min, ranges.fillRatioW.max);
  const taper = clamp(average(taperList), ranges.taperRatio.min, ranges.taperRatio.max);
  const packing = clamp(average(packingList), ranges.packingDensity.min, ranges.packingDensity.max);

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

  // Step 3: Calculate tonnage (frustum formula)
  await notify({ phase: "calculating", detail: "体積・重量計算中...", params: { ...partialParams } }, true);
  startPhase();

  const calc = calculateBoxOverlay(heightM, fillL, fillW, taper, packing, truckClass, material);
  endPhase("計算");

  if (calc.effectivePacking !== packing) {
    console.log(`Packing compression: AI=${packing.toFixed(3)} → effective=${calc.effectivePacking.toFixed(3)} (V=${calc.volume.toFixed(3)}m³)`);
  }

  // partialParams の packingDensity を補正後の値に更新
  partialParams.packingDensity = round3(calc.effectivePacking);

  const result: BoxOverlayResult = {
    method: "box-overlay",
    truckClass,
    materialType: material,
    tgTopY: partialParams.tgTopY,
    cargoTopY: partialParams.cargoTopY,
    tgBotY: partialParams.tgBotY,
    heightM: round3(heightM),
    fillRatioL: round3(fillL),
    fillRatioW: round3(fillW),
    taperRatio: round3(taper),
    packingDensity: round3(calc.effectivePacking),
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

  // 解析ログを非同期保存（失敗しても解析結果は返す）
  if (stockItemId) {
    const imageInfo: ImageInfoLog = {
      count: base64Images.length,
      totalSizeBytes: base64Images.reduce((sum, b64) => sum + Math.floor(b64.length * 3 / 4), 0),
      mimeType: "image/jpeg",
    };
    const analysisLog: AnalysisLog = {
      id: crypto.randomUUID(),
      stockItemId,
      timestamp: Date.now(),
      modelName,
      ensembleCount,
      geometryPrompt: GEOMETRY_PROMPT,
      fillPrompt: FILL_PROMPT,
      geometryRuns: geometryRunLogs,
      fillRuns: fillRunLogs,
      calculation: calc.calculationLog,
      finalResult: result,
      imageInfo,
    };
    saveAnalysisLog(analysisLog).catch((err) => {
      console.error("解析ログ保存エラー:", err);
    });
  }

  return result;
};
