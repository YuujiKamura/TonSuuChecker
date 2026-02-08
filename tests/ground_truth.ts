#!/usr/bin/env npx tsx
/**
 * Ground truth regression test
 *
 * tests/fixtures/ground_truth.json の画像を cli-ai-analyzer 経由で解析し、
 * AI推定パラメータ → tonsuu-core計算式 → 最終推定値 を検証する。
 * 結果は tests/fixtures/last_run.json に保存。
 *
 * 使い方 (環境変数):
 *   TONSUU_GT_INDEX=1 npx tsx tests/ground_truth.ts
 *   TONSUU_GT_NUMBER=1122 npx tsx tests/ground_truth.ts
 *   TONSUU_GT_RANK=low npx tsx tests/ground_truth.ts
 *   TONSUU_GT_ALL=1 npx tsx tests/ground_truth.ts
 *   TONSUU_GT_ENSEMBLE=5 TONSUU_GT_INDEX=1 npx tsx tests/ground_truth.ts
 *   TONSUU_GT_STRATEGY=box-volume npx tsx tests/ground_truth.ts
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';

// --- Paths ---
const CLI_ANALYZER = resolve('C:/Users/yuuji/cli-ai-analyzer/target/release/cli-ai-analyzer.exe');
const FIXTURES_DIR = join(import.meta.dirname!, 'fixtures');

// --- prompt-spec.json SSOT ---
const spec = JSON.parse(readFileSync(join(import.meta.dirname!, '..', 'prompt-spec.json'), 'utf-8'));

// --- Strategy selection ---
const strategyName = process.env.TONSUU_GT_STRATEGY ?? spec.activeStrategy;
const strategy = spec.strategies[strategyName];
if (!strategy) {
  console.error(`Unknown strategy: ${strategyName}`);
  console.error(`Available: ${Object.keys(spec.strategies).join(', ')}`);
  process.exit(1);
}

// --- Types ---
interface GroundTruthEntry {
  file: string;
  description: string;
  actual_tonnage: number;
  truck_class: string;
  material: string;
}

interface AiResponse {
  isTargetDetected: boolean;
  truckType: string;
  materialType: string;
  height: number;
  packingDensity: number;
  fillRatioL: number;
  fillRatioW: number;
  fillRatioZ: number;
  fillRatio?: number;
  confidenceScore: number;
  reasoning: string;
}

interface RunResult {
  file: string;
  description: string;
  actual_tonnage: number;
  ensemble_count: number;
  strategy: string;
  truck_type: string;
  material_type: string;
  height: number | null;
  packing_density: number | null;
  fill_ratio_l: number | null;
  fill_ratio_w: number | null;
  fill_ratio_z: number | null;
  fill_ratio: number | null;
  estimated_volume_m3: number;
  estimated_tonnage: number;
  confidence_score: number;
  reasoning: string;
  error: number;
  error_pct: number;
  // ensemble raw runs (if ensemble > 1)
  runs?: Array<Record<string, number>>;
}

// --- Calculation (tonsuu-core formula, inline) ---
function getMaterialDensity(material: string): number {
  return spec.materials[material]?.density ?? spec.materials['As殻'].density;
}

function calculateTonnage(
  ai: AiResponse,
  materialType: string,
  truckClass?: string,
): { volume: number; tonnage: number } {
  const density = getMaterialDensity(materialType);
  const truckSpec = truckClass ? spec.truckSpecs[truckClass] : null;

  if (strategy.formulaId === 'box-volume') {
    const bedLength = truckSpec?.bedLength ?? 3.4;
    const bedWidth = truckSpec?.bedWidth ?? 2.0;
    const refHeight = strategy.refHeight ?? 0.6;
    const fillRatio = ai.fillRatio ?? 0.5;
    const packingDensity = ai.packingDensity ?? 0.7;
    const volume = bedLength * bedWidth * refHeight * fillRatio;
    const tonnage = volume * density * packingDensity;
    return {
      volume: Math.round(volume * 1000) / 1000,
      tonnage: Math.round(tonnage * 100) / 100,
    };
  }

  // multi-param (default)
  const bedArea = truckSpec ? truckSpec.bedLength * truckSpec.bedWidth : 7.0;
  const fillRatioW = ai.fillRatioW ?? 0.85;
  const height = Math.max(ai.height ?? 0, 0);
  const fillRatioZ = ai.fillRatioZ ?? 0.85;
  const packingDensity = ai.packingDensity ?? 0.8;
  const upperAreaM2 = fillRatioW * bedArea;
  const volume = (upperAreaM2 + bedArea) / 2 * height;
  const tonnage = volume * density * fillRatioZ * packingDensity;
  return {
    volume: Math.round(volume * 1000) / 1000,
    tonnage: Math.round(tonnage * 100) / 100,
  };
}

// --- Prompt builder (from prompt-spec.json) ---
function buildPrompt(): string {
  const tmpl = JSON.stringify(strategy.jsonTemplate);
  return spec.promptFormat
    .replaceAll('{jsonTemplate}', tmpl)
    .replaceAll('{rangeGuide}', strategy.rangeGuide);
}

// --- AI invocation via cli-ai-analyzer ---
function analyzeImage(imagePath: string): AiResponse {
  const prompt = buildPrompt();
  const cmd = [
    `"${CLI_ANALYZER}"`,
    'analyze',
    '--json',
    '--model', process.env.TONSUU_GT_MODEL ?? 'gemini-3-flash-preview',
    '--prompt', `"${prompt.replace(/"/g, '\\"')}"`,
    `"${imagePath}"`,
  ].join(' ');

  const stdout = execSync(cmd, {
    encoding: 'utf-8',
    timeout: 120_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // cli-ai-analyzer returns JSON (may have markdown fences)
  const cleaned = stdout
    .replace(/^```(?:json)?\s*/m, '')
    .replace(/\s*```\s*$/m, '')
    .trim();

  return JSON.parse(cleaned);
}

// --- Depth-volume invocation via Python script ---
interface DepthVolumeResult {
  estimated_tonnage: number;
  estimated_volume_m3: number;
  avg_cargo_height_m: number;
  packing_density: number;
  calibration: string;
  depth_scale: number | null;
}

function analyzeImageDepth(imagePath: string, truckClass: string, material: string): DepthVolumeResult {
  const scriptPath = resolve(import.meta.dirname!, '..', strategy.script ?? 'scripts/depth_volume.py');
  const cmd = [
    'python', `"${scriptPath}"`,
    '--truck-class', truckClass,
    '--material', material,
    `"${imagePath}"`,
  ].join(' ');

  const stdout = execSync(cmd, {
    encoding: 'utf-8',
    timeout: 300_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const brace = stdout.indexOf('{');
  if (brace < 0) throw new Error('No JSON output from depth_volume.py');
  return JSON.parse(stdout.slice(brace));
}

// --- Util ---
function round3(v: number): number { return Math.round(v * 1000) / 1000; }

// --- Clamp to ranges ---
function clampToRanges(r: AiResponse): void {
  const obj = r as unknown as Record<string, number>;
  for (const [key, range] of Object.entries(strategy.ranges) as [string, { min: number; max: number }][]) {
    if (typeof obj[key] === 'number') {
      obj[key] = Math.min(Math.max(obj[key], range.min), range.max);
    }
  }
}

// --- Selection ---
type TonnageRank = 'low' | 'mid' | 'high';
function rankFromTonnage(t: number): TonnageRank {
  if (t <= 3.2) return 'low';
  if (t < 4.0) return 'mid';
  return 'high';
}

function entryMatchesNumber(entry: GroundTruthEntry, number: string): boolean {
  const want = number.replace(/\D/g, '');
  if (!want) return false;
  const haystack = `${entry.file} ${entry.description}`.replace(/\D/g, '');
  return haystack.includes(want);
}

// --- Main ---
function main() {
  const entries: GroundTruthEntry[] = JSON.parse(
    readFileSync(join(FIXTURES_DIR, 'ground_truth.json'), 'utf-8')
  );

  if (!existsSync(CLI_ANALYZER)) {
    console.error(`cli-ai-analyzer not found: ${CLI_ANALYZER}`);
    console.error('Run: cargo build --release --manifest-path C:/Users/yuuji/cli-ai-analyzer/Cargo.toml');
    process.exit(1);
  }

  // Parse env vars
  const gtIndex = process.env.TONSUU_GT_INDEX;
  const gtNumber = process.env.TONSUU_GT_NUMBER;
  const gtRank = process.env.TONSUU_GT_RANK?.toLowerCase() as TonnageRank | undefined;
  const gtAll = ['1', 'true', 'yes'].includes(process.env.TONSUU_GT_ALL?.toLowerCase() ?? '');

  // Select entries
  let selection: GroundTruthEntry[];
  if (gtIndex) {
    const i = parseInt(gtIndex, 10);
    if (i < 1 || i > entries.length) {
      console.error(`index out of range: ${i} (1..=${entries.length})`);
      process.exit(1);
    }
    selection = [entries[i - 1]];
  } else if (gtNumber) {
    selection = entries.filter(e => entryMatchesNumber(e, gtNumber));
    if (selection.length === 0) {
      console.error(`no entry matched number: ${gtNumber}`);
      process.exit(1);
    }
  } else if (gtRank && ['low', 'mid', 'high'].includes(gtRank)) {
    selection = entries.filter(e => rankFromTonnage(e.actual_tonnage) === gtRank);
    if (selection.length === 0) {
      console.error(`no entry matched rank: ${gtRank}`);
      process.exit(1);
    }
  } else if (gtAll) {
    selection = entries;
  } else {
    console.log('No selection specified. Use TONSUU_GT_INDEX/NUMBER/RANK/ALL.');
    console.log(`  Strategies: ${Object.keys(spec.strategies).join(', ')} (active: ${spec.activeStrategy})`);
    console.log(`  Available: ${entries.length} images`);
    entries.forEach((e, i) => console.log(`  ${i + 1}. ${e.file} (${e.actual_tonnage}t)`));
    return;
  }

  const ensembleCount = parseInt(process.env.TONSUU_GT_ENSEMBLE ?? '1', 10) || 1;

  console.log(`\n=== Ground Truth Test [${strategyName}] (${selection.length} images × ${ensembleCount} runs) ===\n`);

  const results: RunResult[] = [];

  for (const entry of selection) {
    const imagePath = join(FIXTURES_DIR, entry.file);
    if (!existsSync(imagePath)) {
      console.error(`Image not found: ${imagePath}`);
      process.exit(1);
    }

    // --- depth-volume strategy: delegate to Python script ---
    if (strategy.formulaId === 'depth-volume') {
      console.log(`  Analyzing (depth): ${entry.file} ...`);
      try {
        const depth = analyzeImageDepth(imagePath, entry.truck_class, entry.material);
        const error = depth.estimated_tonnage - entry.actual_tonnage;
        const errorPct = entry.actual_tonnage > 0 ? (error / entry.actual_tonnage) * 100 : 0;

        const r: RunResult = {
          file: entry.file,
          description: entry.description,
          actual_tonnage: entry.actual_tonnage,
          ensemble_count: 1,
          strategy: strategyName,
          truck_type: entry.truck_class + 'ダンプ',
          material_type: entry.material,
          height: depth.avg_cargo_height_m,
          packing_density: depth.packing_density,
          fill_ratio_l: null,
          fill_ratio_w: null,
          fill_ratio_z: null,
          fill_ratio: null,
          estimated_volume_m3: depth.estimated_volume_m3,
          estimated_tonnage: depth.estimated_tonnage,
          confidence_score: 0,
          reasoning: `depth-volume (${depth.calibration}, scale=${depth.depth_scale})`,
          error,
          error_pct: Math.round(errorPct * 10) / 10,
        };

        console.log('─────────────────────────────────────');
        console.log(`  ${r.description}`);
        console.log(`  Depth分析:`);
        console.log(`    avg_height:    ${depth.avg_cargo_height_m.toFixed(3)} m`);
        console.log(`    packing:       ${depth.packing_density}`);
        console.log(`    volume:        ${depth.estimated_volume_m3.toFixed(2)} m³`);
        console.log(`    calibration:   ${depth.calibration}`);
        console.log(`  結果:`);
        console.log(`    推定: ${r.estimated_tonnage.toFixed(2)} t  /  実測: ${r.actual_tonnage.toFixed(2)} t  /  誤差: ${error >= 0 ? '+' : ''}${error.toFixed(2)} t (${errorPct >= 0 ? '+' : ''}${errorPct.toFixed(1)}%)`);

        results.push(r);
      } catch (e) {
        console.error(`  FAILED: ${e instanceof Error ? e.message : e}`);
      }
      continue;
    }

    // --- Gemini-based strategies (multi-param, box-volume) ---

    // Collect multiple AI runs
    const aiRuns: AiResponse[] = [];
    for (let run = 0; run < ensembleCount; run++) {
      const label = ensembleCount > 1 ? ` (${run + 1}/${ensembleCount})` : '';
      console.log(`  Analyzing: ${entry.file}${label} ...`);
      try {
        const ai = analyzeImage(imagePath);
        clampToRanges(ai);
        aiRuns.push(ai);
      } catch (e) {
        console.error(`  FAILED: ${e instanceof Error ? e.message : e}`);
      }
    }

    if (aiRuns.length === 0) {
      console.error(`  All runs failed for ${entry.file}`);
      continue;
    }

    // Average parameters across runs
    const avg = (fn: (a: AiResponse) => number) =>
      aiRuns.reduce((s, a) => s + fn(a), 0) / aiRuns.length;

    // Mode for categorical fields
    const mode = <T>(arr: T[]): T => {
      const counts = new Map<string, number>();
      for (const v of arr) { counts.set(String(v), (counts.get(String(v)) ?? 0) + 1); }
      const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      return arr.find(v => String(v) === best)!;
    };
    const truckType = mode(aiRuns.map(a => a.truckType));
    const materialType = mode(aiRuns.map(a => a.materialType));

    // Strategy-specific averaging and per-run data
    let avgHeight: number | null = null;
    let avgPacking: number | null = null;
    let avgFillL: number | null = null;
    let avgFillW: number | null = null;
    let avgFillZ: number | null = null;
    let avgFillRatio: number | null = null;
    let runs: Array<Record<string, number>>;

    if (strategy.formulaId === 'box-volume') {
      avgFillRatio = avg(a => a.fillRatio ?? 0.5);
      avgPacking = avg(a => a.packingDensity ?? 0.7);
      runs = aiRuns.map(a => {
        const t = calculateTonnage(a, a.materialType ?? 'As殻', entry.truck_class);
        return {
          fillRatio: a.fillRatio ?? 0.5,
          packingDensity: a.packingDensity ?? 0.7,
          tonnage: t.tonnage,
        };
      });
    } else {
      // multi-param
      avgHeight = avg(a => a.height ?? 0);
      avgPacking = avg(a => a.packingDensity ?? 0.8);
      avgFillL = avg(a => a.fillRatioL ?? 0.85);
      avgFillW = avg(a => a.fillRatioW ?? 0.85);
      avgFillZ = avg(a => a.fillRatioZ ?? 0.85);
      runs = aiRuns.map(a => {
        const t = calculateTonnage(a, a.materialType ?? 'As殻', entry.truck_class);
        return {
          height: a.height, packingDensity: a.packingDensity,
          fillRatioL: a.fillRatioL, fillRatioW: a.fillRatioW, fillRatioZ: a.fillRatioZ,
          tonnage: t.tonnage,
        };
      });
    }

    // Build averaged AiResponse for tonnage calculation
    const avgAi: AiResponse = {
      isTargetDetected: true,
      truckType,
      materialType,
      height: avgHeight ?? 0,
      packingDensity: avgPacking ?? 0.8,
      fillRatioL: avgFillL ?? 0.85,
      fillRatioW: avgFillW ?? 0.85,
      fillRatioZ: avgFillZ ?? 0.85,
      fillRatio: avgFillRatio ?? undefined,
      confidenceScore: avg(a => a.confidenceScore),
      reasoning: '',
    };
    const { volume, tonnage } = calculateTonnage(avgAi, materialType, entry.truck_class);

    const error = tonnage - entry.actual_tonnage;
    const errorPct = entry.actual_tonnage > 0 ? (error / entry.actual_tonnage) * 100 : 0;

    const r: RunResult = {
      file: entry.file,
      description: entry.description,
      actual_tonnage: entry.actual_tonnage,
      ensemble_count: aiRuns.length,
      strategy: strategyName,
      truck_type: truckType,
      material_type: materialType,
      height: avgHeight != null ? round3(avgHeight) : null,
      packing_density: avgPacking != null ? round3(avgPacking) : null,
      fill_ratio_l: avgFillL != null ? round3(avgFillL) : null,
      fill_ratio_w: avgFillW != null ? round3(avgFillW) : null,
      fill_ratio_z: avgFillZ != null ? round3(avgFillZ) : null,
      fill_ratio: avgFillRatio != null ? round3(avgFillRatio) : null,
      estimated_volume_m3: volume,
      estimated_tonnage: tonnage,
      confidence_score: avg(a => a.confidenceScore),
      reasoning: ensembleCount > 1
        ? `【ensemble ${aiRuns.length}回平均】${aiRuns[0].reasoning}`
        : aiRuns[0].reasoning,
      error,
      error_pct: Math.round(errorPct * 10) / 10,
      ...(ensembleCount > 1 ? { runs } : {}),
    };

    // Print
    console.log('─────────────────────────────────────');
    console.log(`  ${r.description}`);
    if (ensembleCount > 1) {
      console.log(`  個別推論:`);
      if (strategy.formulaId === 'box-volume') {
        runs.forEach((run, i) =>
          console.log(`    #${i + 1}: fill=${run.fillRatio} pd=${run.packingDensity} → ${run.tonnage.toFixed(2)}t`)
        );
      } else {
        runs.forEach((run, i) =>
          console.log(`    #${i + 1}: h=${run.height} pd=${run.packingDensity} L=${run.fillRatioL} W=${run.fillRatioW} Z=${run.fillRatioZ} → ${run.tonnage.toFixed(2)}t`)
        );
      }
      console.log(`  平均値:`);
    } else {
      console.log(`  AI判断:`);
    }
    console.log(`    truck_type:    ${r.truck_type}`);
    console.log(`    material_type: ${r.material_type}`);
    if (strategy.formulaId === 'box-volume') {
      console.log(`    fill_ratio:    ${r.fill_ratio}`);
      console.log(`    packing:       ${r.packing_density}`);
    } else {
      console.log(`    height:        ${r.height} m`);
      console.log(`    packing:       ${r.packing_density}`);
      console.log(`    fill_ratio_l:  ${r.fill_ratio_l}`);
      console.log(`    fill_ratio_w:  ${r.fill_ratio_w}`);
      console.log(`    fill_ratio_z:  ${r.fill_ratio_z}`);
    }
    console.log(`    volume:        ${r.estimated_volume_m3.toFixed(2)} m³`);
    console.log(`    confidence:    ${(r.confidence_score * 100).toFixed(0)}%`);
    console.log(`  結果:`);
    console.log(`    推定: ${r.estimated_tonnage.toFixed(2)} t  /  実測: ${r.actual_tonnage.toFixed(2)} t  /  誤差: ${error >= 0 ? '+' : ''}${error.toFixed(2)} t (${errorPct >= 0 ? '+' : ''}${errorPct.toFixed(1)}%)`);

    results.push(r);
  }

  // Summary
  if (results.length > 1) {
    console.log('\n═══════════════════════════════════════');
    console.log(`  Summary (${results.length} images)`);
    console.log('═══════════════════════════════════════');

    const mae = results.reduce((s, r) => s + Math.abs(r.error), 0) / results.length;
    const meanErr = results.reduce((s, r) => s + r.error, 0) / results.length;
    const rmse = Math.sqrt(results.reduce((s, r) => s + r.error ** 2, 0) / results.length);

    for (const r of results) {
      const tag = r.file.padEnd(35);
      console.log(`  ${tag} est ${r.estimated_tonnage.toFixed(2)}t  act ${r.actual_tonnage.toFixed(2)}t  err ${r.error >= 0 ? '+' : ''}${r.error.toFixed(2)}t`);
    }
    console.log('  ---');
    console.log(`  Mean Error:     ${meanErr >= 0 ? '+' : ''}${meanErr.toFixed(3)} t`);
    console.log(`  Mean Abs Error: ${mae.toFixed(3)} t`);
    console.log(`  RMSE:           ${rmse.toFixed(3)} t`);
  }

  // Save
  const outPath = join(FIXTURES_DIR, 'last_run.json');
  writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\n結果を保存: ${outPath}`);
}

main();
