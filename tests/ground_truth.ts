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
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';

// --- Paths ---
const CLI_ANALYZER = resolve('C:/Users/yuuji/cli-ai-analyzer/target/release/cli-ai-analyzer.exe');
const FIXTURES_DIR = join(import.meta.dirname!, 'fixtures');

// --- prompt-spec.json SSOT ---
const spec = JSON.parse(readFileSync(join(import.meta.dirname!, '..', 'prompt-spec.json'), 'utf-8'));

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
  confidenceScore: number;
  reasoning: string;
}

interface RunResult {
  file: string;
  description: string;
  actual_tonnage: number;
  truck_type: string;
  material_type: string;
  height: number | null;
  packing_density: number | null;
  fill_ratio_l: number | null;
  fill_ratio_w: number | null;
  fill_ratio_z: number | null;
  estimated_volume_m3: number;
  estimated_tonnage: number;
  confidence_score: number;
  reasoning: string;
  error: number;
  error_pct: number;
}

// --- Calculation (tonsuu-core formula, inline) ---
function getTruckBedArea(truckClass: string): number {
  const s = spec.truckSpecs[truckClass];
  return s ? s.bedLength * s.bedWidth : spec.calculation.defaultBedAreaM2;
}

function getMaterialDensity(material: string): number {
  return spec.materials[material]?.density ?? spec.materials['As殻'].density;
}

function calculateTonnage(
  fillRatioW: number,
  height: number,
  fillRatioZ: number,
  packingDensity: number,
  materialType: string,
  truckClass?: string,
): { volume: number; tonnage: number } {
  const bedArea = truckClass ? getTruckBedArea(truckClass) : spec.calculation.defaultBedAreaM2;
  const upperAreaM2 = fillRatioW * bedArea;
  const effectiveHeight = Math.max(height, 0);
  const volume = (upperAreaM2 + bedArea) / 2 * effectiveHeight;
  const density = getMaterialDensity(materialType);
  const tonnage = volume * density * fillRatioZ * packingDensity;
  return {
    volume: Math.round(volume * 1000) / 1000,
    tonnage: Math.round(tonnage * 100) / 100,
  };
}

// --- Prompt builder (from prompt-spec.json) ---
function buildPrompt(): string {
  const tmpl = JSON.stringify(spec.jsonTemplate);
  return spec.promptFormat
    .replaceAll('{jsonTemplate}', tmpl)
    .replaceAll('{rangeGuide}', spec.rangeGuide);
}

// --- AI invocation via cli-ai-analyzer ---
function analyzeImage(imagePath: string): AiResponse {
  const prompt = buildPrompt();
  const cmd = [
    `"${CLI_ANALYZER}"`,
    'analyze',
    '--json',
    '--model', 'gemini-3-flash-preview',
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

// --- Clamp to ranges ---
function clampToRanges(r: AiResponse): void {
  for (const [key, range] of Object.entries(spec.ranges) as [string, { min: number; max: number }][]) {
    if (typeof (r as Record<string, unknown>)[key] === 'number') {
      (r as Record<string, number>)[key] = Math.min(Math.max((r as Record<string, number>)[key], range.min), range.max);
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
    console.log(`  Available: ${entries.length} images`);
    entries.forEach((e, i) => console.log(`  ${i + 1}. ${e.file} (${e.actual_tonnage}t)`));
    return;
  }

  console.log(`\n=== Ground Truth Test (${selection.length} images) ===\n`);

  const results: RunResult[] = [];

  for (const entry of selection) {
    const imagePath = join(FIXTURES_DIR, entry.file);
    if (!existsSync(imagePath)) {
      console.error(`Image not found: ${imagePath}`);
      process.exit(1);
    }

    console.log(`  Analyzing: ${entry.file} ...`);

    let ai: AiResponse;
    try {
      ai = analyzeImage(imagePath);
    } catch (e) {
      console.error(`  FAILED: ${e instanceof Error ? e.message : e}`);
      continue;
    }

    clampToRanges(ai);

    // Calculate tonnage (code-side, same as tonsuu-core)
    const { volume, tonnage } = calculateTonnage(
      ai.fillRatioW ?? 0.85,
      ai.height ?? 0,
      ai.fillRatioZ ?? 0.85,
      ai.packingDensity ?? 0.8,
      ai.materialType ?? 'As殻',
      entry.truck_class,
    );

    const error = tonnage - entry.actual_tonnage;
    const errorPct = entry.actual_tonnage > 0 ? (error / entry.actual_tonnage) * 100 : 0;

    const r: RunResult = {
      file: entry.file,
      description: entry.description,
      actual_tonnage: entry.actual_tonnage,
      truck_type: ai.truckType,
      material_type: ai.materialType,
      height: ai.height ?? null,
      packing_density: ai.packingDensity ?? null,
      fill_ratio_l: ai.fillRatioL ?? null,
      fill_ratio_w: ai.fillRatioW ?? null,
      fill_ratio_z: ai.fillRatioZ ?? null,
      estimated_volume_m3: volume,
      estimated_tonnage: tonnage,
      confidence_score: ai.confidenceScore,
      reasoning: ai.reasoning,
      error,
      error_pct: Math.round(errorPct * 10) / 10,
    };

    // Print
    console.log('─────────────────────────────────────');
    console.log(`  ${r.description}`);
    console.log(`  AI判断:`);
    console.log(`    truck_type:    ${r.truck_type}`);
    console.log(`    material_type: ${r.material_type}`);
    console.log(`    height:        ${r.height} m`);
    console.log(`    packing:       ${r.packing_density}`);
    console.log(`    fill_ratio_l:  ${r.fill_ratio_l}`);
    console.log(`    fill_ratio_w:  ${r.fill_ratio_w}`);
    console.log(`    fill_ratio_z:  ${r.fill_ratio_z}`);
    console.log(`    volume:        ${r.estimated_volume_m3.toFixed(2)} m³`);
    console.log(`    confidence:    ${(r.confidence_score * 100).toFixed(0)}%`);
    console.log(`  結果:`);
    console.log(`    推定: ${r.estimated_tonnage.toFixed(2)} t  /  実測: ${r.actual_tonnage.toFixed(2)} t  /  誤差: ${error >= 0 ? '+' : ''}${error.toFixed(2)} t (${errorPct >= 0 ? '+' : ''}${errorPct.toFixed(1)}%)`);
    console.log(`  reasoning: ${r.reasoning}`);

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
