/**
 * 建設廃棄物処理実績集計表 CLI生成スクリプト
 *
 * 使い方:
 *   npx tsx scripts/generateReport.ts <入力JSON> [出力ファイル名]
 *   npx tsx scripts/generateReport.ts --sample  # サンプルJSON生成
 *
 * 例:
 *   npx tsx scripts/generateReport.ts data.json 産廃集計表.xlsx
 */

import * as fs from 'fs';
import * as path from 'path';
import ExcelJS from 'exceljs';

// エントリー型（簡易版）
interface WasteEntry {
  manifestNumber: string;    // マニフェスト伝票番号
  wasteType: string;         // 廃棄物の種類
  deliveryDate: string;      // 交付日 (YYYY-MM-DD or YYYY/MM/DD)
  unit: string;              // 単位（ｔ or ㎥）
  amount: number;            // 搬出量
  destination: string;       // 搬出先
  remarks?: string;          // 備考
}

// エクスポート設定
interface ExportConfig {
  projectNumber?: string;    // 工事番号
  projectName?: string;      // 工事名
  contractorName?: string;   // 受注者名
  siteManager?: string;      // 現場代理人
}

// 入力JSON型
interface InputData {
  config: ExportConfig;
  entries: WasteEntry[];
}

// 罫線スタイル
const thinBorder: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FF000000' } };
const allBorders: Partial<ExcelJS.Borders> = {
  top: thinBorder,
  left: thinBorder,
  bottom: thinBorder,
  right: thinBorder
};

// スタイル定義
const headerFont: Partial<ExcelJS.Font> = { name: 'ＭＳ ゴシック', size: 11, bold: true };
const headerAlignment: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle' };
const dataFont: Partial<ExcelJS.Font> = { name: 'ＭＳ ゴシック', size: 11 };
const dataAlignment: Partial<ExcelJS.Alignment> = { vertical: 'middle' };
const titleStyle: Partial<ExcelJS.Style> = {
  font: { name: 'ＭＳ ゴシック', size: 14, bold: true },
  alignment: { horizontal: 'center', vertical: 'middle' }
};

// 列幅設定
const COLUMN_WIDTHS: { [key: string]: number } = {
  'A': 2, 'B': 8, 'C': 16, 'D': 13, 'E': 17, 'F': 5, 'G': 10, 'H': 17
};

// 文字列幅計算
const getTextWidth = (text: string): number => {
  if (!text) return 0;
  let width = 0;
  for (const char of text) {
    width += char.charCodeAt(0) > 255 ? 2 : 1;
  }
  return Math.ceil(width * 1.2);
};

// 日付パース
const parseDate = (dateStr: string): Date => {
  const normalized = dateStr.replace(/\//g, '-');
  return new Date(normalized);
};

// ワークシート作成
const createWorksheet = (
  workbook: ExcelJS.Workbook,
  sheetName: string,
  config: ExportConfig,
  entries: WasteEntry[]
): ExcelJS.Worksheet => {
  const ws = workbook.addWorksheet(sheetName);

  // 列幅
  const maxWidths = { ...COLUMN_WIDTHS };
  entries.forEach(entry => {
    if (entry.manifestNumber) maxWidths['E'] = Math.max(maxWidths['E'], getTextWidth(entry.manifestNumber));
    if (entry.wasteType) maxWidths['C'] = Math.max(maxWidths['C'], getTextWidth(entry.wasteType));
    if (entry.remarks) maxWidths['H'] = Math.max(maxWidths['H'], getTextWidth(entry.remarks));
  });
  Object.entries(maxWidths).forEach(([col, width]) => {
    ws.getColumn(col).width = width;
  });

  // タイトル
  ws.mergeCells('B1:H1');
  const titleCell = ws.getCell('B1');
  titleCell.value = '建設廃棄物処理実績集計表';
  titleCell.style = titleStyle;

  // 工事情報スタイル
  const infoFont: Partial<ExcelJS.Font> = { name: 'ＭＳ ゴシック', size: 10 };
  const infoAlign: Partial<ExcelJS.Alignment> = { horizontal: 'left', vertical: 'middle' };

  // 工事情報
  ws.getCell('B2').value = '工事番号'; ws.getCell('B2').font = infoFont; ws.getCell('B2').alignment = infoAlign;
  ws.getCell('C2').value = config.projectNumber || ''; ws.getCell('C2').font = infoFont;
  ws.mergeCells('F2:G2');
  ws.getCell('F2').value = '受注者名'; ws.getCell('F2').font = infoFont; ws.getCell('F2').alignment = infoAlign;
  ws.getCell('H2').value = config.contractorName || ''; ws.getCell('H2').font = infoFont;

  ws.getCell('B3').value = '工事名'; ws.getCell('B3').font = infoFont; ws.getCell('B3').alignment = infoAlign;
  ws.mergeCells('C3:E3');
  ws.getCell('C3').value = config.projectName || ''; ws.getCell('C3').font = infoFont;
  ws.mergeCells('F3:G3');
  ws.getCell('F3').value = '現場代理人'; ws.getCell('F3').font = infoFont; ws.getCell('F3').alignment = infoAlign;
  ws.getCell('H3').value = config.siteManager || ''; ws.getCell('H3').font = infoFont;

  ws.getCell('B4').value = '搬出先'; ws.getCell('B4').font = infoFont; ws.getCell('B4').alignment = infoAlign;
  ws.mergeCells('C4:H4');
  ws.getCell('C4').value = entries.length > 0 ? entries[0].destination : ''; ws.getCell('C4').font = infoFont;

  // ヘッダー行
  ws.mergeCells('B5:B6'); ws.getCell('B5').value = '通番号'; ws.getCell('B5').font = headerFont; ws.getCell('B5').alignment = headerAlignment;
  ws.mergeCells('C5:C6'); ws.getCell('C5').value = '廃棄物の種類'; ws.getCell('C5').font = headerFont; ws.getCell('C5').alignment = headerAlignment;
  ws.mergeCells('D5:D6'); ws.getCell('D5').value = '交付日'; ws.getCell('D5').font = headerFont; ws.getCell('D5').alignment = headerAlignment;
  ws.getCell('E5').value = 'マニフェスト'; ws.getCell('E5').font = headerFont; ws.getCell('E5').alignment = headerAlignment;
  ws.getCell('E6').value = '伝票番号'; ws.getCell('E6').font = headerFont; ws.getCell('E6').alignment = headerAlignment;
  ws.mergeCells('F5:F6'); ws.getCell('F5').value = '単位'; ws.getCell('F5').font = headerFont; ws.getCell('F5').alignment = headerAlignment;
  ws.mergeCells('G5:G6'); ws.getCell('G5').value = '搬出量'; ws.getCell('G5').font = headerFont; ws.getCell('G5').alignment = headerAlignment;
  ws.mergeCells('H5:H6'); ws.getCell('H5').value = '備　考'; ws.getCell('H5').font = headerFont; ws.getCell('H5').alignment = headerAlignment;

  // 行高さ
  const lastDataRow = 7 + Math.max(entries.length, 20);
  for (let i = 1; i <= lastDataRow; i++) {
    ws.getRow(i).height = 27;
  }

  // データ行
  let rowIndex = 7;
  let totalAmount = 0;

  entries.forEach((entry, idx) => {
    const row = ws.getRow(rowIndex);
    row.getCell('B').value = idx + 1;
    row.getCell('B').font = dataFont;
    row.getCell('B').alignment = { horizontal: 'center', vertical: 'middle' };

    row.getCell('C').value = entry.wasteType;
    row.getCell('C').font = dataFont;
    row.getCell('C').alignment = dataAlignment;

    row.getCell('D').value = parseDate(entry.deliveryDate);
    row.getCell('D').numFmt = 'yyyy/mm/dd';
    row.getCell('D').font = dataFont;
    row.getCell('D').alignment = { horizontal: 'center', vertical: 'middle' };

    row.getCell('E').value = entry.manifestNumber;
    row.getCell('E').font = dataFont;
    row.getCell('E').alignment = dataAlignment;

    row.getCell('F').value = entry.unit;
    row.getCell('F').font = dataFont;
    row.getCell('F').alignment = { horizontal: 'center', vertical: 'middle' };

    row.getCell('G').value = entry.amount > 0 ? entry.amount : '';
    if (entry.amount > 0) row.getCell('G').numFmt = '#,##0.00';
    row.getCell('G').font = dataFont;
    row.getCell('G').alignment = { horizontal: 'right', vertical: 'middle' };

    row.getCell('H').value = entry.remarks || '';
    row.getCell('H').font = dataFont;
    row.getCell('H').alignment = dataAlignment;

    if (entry.amount > 0) totalAmount += entry.amount;
    rowIndex++;
  });

  // 空行
  const MIN_DATA_ROWS = 20;
  const dataRowCount = Math.max(entries.length, MIN_DATA_ROWS);
  for (let i = entries.length; i < dataRowCount; i++) {
    const emptyRowIndex = 7 + i;
    ws.getCell(`B${emptyRowIndex}`).value = i + 1;
    ws.getCell(`B${emptyRowIndex}`).font = dataFont;
    ws.getCell(`B${emptyRowIndex}`).alignment = { horizontal: 'center', vertical: 'middle' };
    ['C', 'D', 'E', 'F', 'G', 'H'].forEach(col => {
      ws.getCell(`${col}${emptyRowIndex}`).font = dataFont;
      ws.getCell(`${col}${emptyRowIndex}`).alignment = dataAlignment;
    });
  }

  // 合計行
  const sumRowIndex = 7 + dataRowCount;
  ws.mergeCells(`B${sumRowIndex}:F${sumRowIndex}`);
  ws.getCell(`B${sumRowIndex}`).value = '合　計';
  ws.getCell(`B${sumRowIndex}`).font = headerFont;
  ws.getCell(`B${sumRowIndex}`).alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell(`G${sumRowIndex}`).value = totalAmount;
  ws.getCell(`G${sumRowIndex}`).numFmt = '#,##0.00';
  ws.getCell(`G${sumRowIndex}`).font = headerFont;
  ws.getCell(`G${sumRowIndex}`).alignment = { horizontal: 'right', vertical: 'middle' };
  ws.getCell(`H${sumRowIndex}`).font = headerFont;

  // 罫線
  for (let r = 5; r <= sumRowIndex; r++) {
    ['B', 'C', 'D', 'E', 'F', 'G', 'H'].forEach(col => {
      ws.getCell(`${col}${r}`).border = allBorders;
    });
  }

  // 注記
  const noteStartRow = sumRowIndex + 1;
  const noteFont: Partial<ExcelJS.Font> = { name: 'ＭＳ ゴシック', size: 10 };
  const notes = [
    '　注１　廃棄物の種類毎に搬出量の計を記載すること。',
    '　注２　監督職員は建設系廃棄物マニフェスト伝票と照合し確認すること。',
    '　注３　受注者はしゅん工検査時に建設系マニフェスト伝票Ａ、Ｂ2、Ｂ1、Ｄ、Ｅ票を持参し、検査員の',
    '　　　　指示に応じて提示すること。なお、Ｅ票については、しゅん工検査時点で最終処分業者より返送',
    '　　　　されているもののみとする。'
  ];
  notes.forEach((note, idx) => {
    ws.getCell(`B${noteStartRow + idx}`).value = note;
    ws.getCell(`B${noteStartRow + idx}`).font = noteFont;
  });

  return ws;
};

// 日付グループ化
const groupByDate = (entries: WasteEntry[]): Map<string, WasteEntry[]> => {
  const groups = new Map<string, WasteEntry[]>();
  entries.forEach(entry => {
    const date = parseDate(entry.deliveryDate);
    const dateKey = date.toISOString().split('T')[0];
    if (!groups.has(dateKey)) groups.set(dateKey, []);
    groups.get(dateKey)!.push(entry);
  });
  return groups;
};

// サンプルJSON生成
const generateSample = (): InputData => ({
  config: {
    projectNumber: "R6-001",
    projectName: "〇〇道路改良工事",
    contractorName: "株式会社〇〇建設",
    siteManager: "山田 太郎"
  },
  entries: [
    { manifestNumber: "A-001", wasteType: "アスファルト殻", deliveryDate: "2024-12-20", unit: "ｔ", amount: 5.50, destination: "〇〇リサイクルセンター", remarks: "" },
    { manifestNumber: "A-002", wasteType: "アスファルト殻", deliveryDate: "2024-12-20", unit: "ｔ", amount: 6.20, destination: "〇〇リサイクルセンター", remarks: "" },
    { manifestNumber: "A-003", wasteType: "コンクリート殻", deliveryDate: "2024-12-21", unit: "ｔ", amount: 8.30, destination: "〇〇リサイクルセンター", remarks: "有筋" }
  ]
});

// メイン
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
建設廃棄物処理実績集計表 CLI生成ツール

使い方:
  npx tsx scripts/generateReport.ts <入力JSON> [出力ファイル名]
  npx tsx scripts/generateReport.ts --sample  # サンプルJSON生成

例:
  npx tsx scripts/generateReport.ts data.json
  npx tsx scripts/generateReport.ts data.json 産廃集計表_202412.xlsx
`);
    process.exit(0);
  }

  if (args[0] === '--sample') {
    const sample = generateSample();
    const outputPath = 'sample_data.json';
    fs.writeFileSync(outputPath, JSON.stringify(sample, null, 2), 'utf-8');
    console.log(`サンプルJSONを生成しました: ${outputPath}`);
    process.exit(0);
  }

  const inputPath = args[0];
  const outputPath = args[1] || '産廃集計表.xlsx';

  if (!fs.existsSync(inputPath)) {
    console.error(`入力ファイルが見つかりません: ${inputPath}`);
    process.exit(1);
  }

  // JSON読み込み
  const rawData = fs.readFileSync(inputPath, 'utf-8');
  const data: InputData = JSON.parse(rawData);

  if (!data.entries || data.entries.length === 0) {
    console.error('エントリーデータがありません');
    process.exit(1);
  }

  console.log(`${data.entries.length}件のエントリーを処理します...`);

  // ワークブック生成
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TonSuuChecker CLI';
  workbook.created = new Date();

  // 日付グループ化
  const dateGroups = groupByDate(data.entries);
  const defaultWasteType = data.entries[0]?.wasteType || 'アスファルト殻';
  const defaultDestination = data.entries[0]?.destination || '';
  const defaultUnit = data.entries[0]?.unit || 'ｔ';

  // 統括表
  const summaryEntries: WasteEntry[] = [];
  dateGroups.forEach((groupEntries, dateKey) => {
    const totalAmount = groupEntries.reduce((sum, e) => sum + e.amount, 0);
    summaryEntries.push({
      manifestNumber: '',
      wasteType: defaultWasteType,
      deliveryDate: dateKey,
      unit: defaultUnit,
      amount: totalAmount,
      destination: defaultDestination
    });
  });
  createWorksheet(workbook, '統括表', data.config, summaryEntries);

  // 日付ごとのシート
  dateGroups.forEach((groupEntries, dateKey) => {
    const date = new Date(dateKey);
    const sheetName = `${date.getDate()}`;
    createWorksheet(workbook, sheetName, data.config, groupEntries);
  });

  // ファイル書き込み
  await workbook.xlsx.writeFile(outputPath);
  console.log(`Excelファイルを生成しました: ${outputPath}`);
  console.log(`  - 統括表: 1シート`);
  console.log(`  - 日付シート: ${dateGroups.size}シート`);
}

main().catch(err => {
  console.error('エラー:', err);
  process.exit(1);
});
