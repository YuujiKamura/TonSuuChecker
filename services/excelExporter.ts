/**
 * 建設廃棄物処理実績集計表 Excel出力サービス
 * ExcelJSを使用してテンプレート形式のExcelを生成する
 *
 * テンプレート構造（列）:
 * B列: 通番号
 * C列: 廃棄物の種類
 * D列: 交付日（yyyy/mm/dd）
 * E列: マニフェスト伝票番号
 * F列: 単位（ｔ、㎥）
 * G列: 搬出量
 * H列: 搬出先
 * I列: 備考
 *
 * データ開始行: 10行目
 */

import { StockItem } from '../types';
import ExcelJS from 'exceljs';

// 産廃データのエントリー型
export interface WasteEntry {
  manifestNumber: string;    // マニフェスト伝票番号
  wasteType: string;         // 廃棄物の種類（例: アスファルト殻）
  deliveryDate: Date;        // 交付日
  unit: string;              // 単位（ｔ or ㎥）
  amount: number;            // 搬出量
  destination: string;       // 搬出先
  remarks?: string;          // 備考
}

// エクスポート設定
export interface ExportConfig {
  projectNumber?: string;    // 工事番号
  projectName?: string;      // 工事名
  contractorName?: string;   // 受注者名
  siteManager?: string;      // 現場代理人
}

// StockItemをWasteEntryに変換するヘルパー
export const stockItemToWasteEntry = (
  item: StockItem,
  wasteType: string = 'アスファルト殻',
  destination: string = '',
  unit: string = 'ｔ'
): WasteEntry | null => {
  if (!item.actualTonnage) {
    return null;
  }
  return {
    manifestNumber: item.manifestNumber || '',
    wasteType,
    deliveryDate: new Date(item.timestamp),
    unit,
    amount: item.actualTonnage,
    destination,
    remarks: item.memo
  };
};

// 罫線スタイル
const thinBorder: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FF000000' } };
const allBorders: Partial<ExcelJS.Borders> = {
  top: thinBorder,
  left: thinBorder,
  bottom: thinBorder,
  right: thinBorder
};

// ヘッダーセルスタイル（罫線は後で適用）
const headerFont: Partial<ExcelJS.Font> = { name: 'ＭＳ ゴシック', size: 11, bold: true };
const headerAlignment: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle' };

// データセルスタイル（罫線は後で適用）
const dataFont: Partial<ExcelJS.Font> = { name: 'ＭＳ ゴシック', size: 11 };
const dataAlignment: Partial<ExcelJS.Alignment> = { vertical: 'middle' };

// タイトルスタイル
const titleStyle: Partial<ExcelJS.Style> = {
  font: { name: 'ＭＳ ゴシック', size: 14, bold: true },
  alignment: { horizontal: 'center', vertical: 'middle' }
};

// 列幅設定（最小値）
const COLUMN_WIDTHS: { [key: string]: number } = {
  'A': 2,
  'B': 8,
  'C': 16,
  'D': 13,    // 交付日（yyyy/mm/dd）が切れないよう広め
  'E': 13,
  'F': 5,
  'G': 10,
  'H': 19,
  'I': 10
};

// 文字列の表示幅を計算（全角文字は2、半角は1として概算）
const getTextWidth = (text: string): number => {
  if (!text) return 0;
  let width = 0;
  for (const char of text) {
    // 全角文字（日本語、全角記号など）は幅2、それ以外は1
    width += char.charCodeAt(0) > 255 ? 2 : 1;
  }
  // ExcelJSの列幅に換算（×1.2で余裕を持たせる）
  return Math.ceil(width * 1.2);
};

// ワークシートを作成
const createWorksheet = (
  workbook: ExcelJS.Workbook,
  sheetName: string,
  config: ExportConfig,
  entries: WasteEntry[]
): ExcelJS.Worksheet => {
  const ws = workbook.addWorksheet(sheetName);

  // 列幅の最大値を追跡（オートフィット用）
  const maxWidths: { [key: string]: number } = { ...COLUMN_WIDTHS };

  // 工事情報の幅をチェック
  if (config.projectName) {
    // C7:E7に結合されているので、3列分として計算
    const projectNameWidth = Math.ceil(getTextWidth(config.projectName) / 3);
    maxWidths['C'] = Math.max(maxWidths['C'], projectNameWidth);
  }
  if (config.contractorName) {
    maxWidths['H'] = Math.max(maxWidths['H'], getTextWidth(config.contractorName));
  }

  // エントリーデータの幅をチェック
  entries.forEach(entry => {
    if (entry.manifestNumber) {
      maxWidths['E'] = Math.max(maxWidths['E'], getTextWidth(entry.manifestNumber));
    }
    if (entry.destination) {
      maxWidths['H'] = Math.max(maxWidths['H'], getTextWidth(entry.destination));
    }
    if (entry.wasteType) {
      maxWidths['C'] = Math.max(maxWidths['C'], getTextWidth(entry.wasteType));
    }
    if (entry.remarks) {
      maxWidths['I'] = Math.max(maxWidths['I'], getTextWidth(entry.remarks));
    }
  });

  // 列幅設定（オートフィット適用）
  Object.entries(maxWidths).forEach(([col, width]) => {
    ws.getColumn(col).width = width;
  });

  // 行高設定（約1.3倍）
  for (let i = 1; i <= 5; i++) {
    ws.getRow(i).height = 20;
  }
  for (let i = 6; i <= 9; i++) {
    ws.getRow(i).height = 24;
  }

  // タイトル（B3:I4）
  ws.mergeCells('B3:I4');
  const titleCell = ws.getCell('B3');
  titleCell.value = '建設廃棄物処理実績集計表';
  titleCell.style = titleStyle;

  // 工事情報（行6-7）
  ws.getCell('B6').value = '工事番号';
  ws.getCell('C6').value = config.projectNumber || '';
  ws.mergeCells('F6:G6');
  ws.getCell('F6').value = '受注者名';
  ws.getCell('H6').value = config.contractorName || '';

  ws.getCell('B7').value = '工事名';
  ws.mergeCells('C7:E7');
  ws.getCell('C7').value = config.projectName || '';
  ws.mergeCells('F7:G7');
  ws.getCell('F7').value = '現場代理人';
  ws.getCell('H7').value = config.siteManager || '';

  // 工事情報のスタイル
  ['B6', 'F6', 'B7', 'F7'].forEach(addr => {
    ws.getCell(addr).style = {
      font: { name: 'ＭＳ ゴシック', size: 10 },
      alignment: { vertical: 'middle' }
    };
  });

  // ヘッダー行（8-9行目）
  ws.mergeCells('B8:B9');
  ws.getCell('B8').value = '通番号';
  ws.getCell('B8').font = headerFont;
  ws.getCell('B8').alignment = headerAlignment;

  ws.mergeCells('C8:C9');
  ws.getCell('C8').value = '廃棄物の種類';
  ws.getCell('C8').font = headerFont;
  ws.getCell('C8').alignment = headerAlignment;

  ws.mergeCells('D8:D9');
  ws.getCell('D8').value = '交付日';
  ws.getCell('D8').font = headerFont;
  ws.getCell('D8').alignment = headerAlignment;

  // マニフェスト伝票番号は2行に分割
  ws.getCell('E8').value = 'マニフェスト';
  ws.getCell('E8').font = headerFont;
  ws.getCell('E8').alignment = headerAlignment;
  ws.getCell('E9').value = '伝票番号';
  ws.getCell('E9').font = headerFont;
  ws.getCell('E9').alignment = headerAlignment;

  ws.mergeCells('F8:F9');
  ws.getCell('F8').value = '単位';
  ws.getCell('F8').font = headerFont;
  ws.getCell('F8').alignment = headerAlignment;

  ws.mergeCells('G8:G9');
  ws.getCell('G8').value = '搬出量';
  ws.getCell('G8').font = headerFont;
  ws.getCell('G8').alignment = headerAlignment;

  ws.mergeCells('H8:H9');
  ws.getCell('H8').value = '搬出先';
  ws.getCell('H8').font = headerFont;
  ws.getCell('H8').alignment = headerAlignment;

  ws.mergeCells('I8:I9');
  ws.getCell('I8').value = '備　考';
  ws.getCell('I8').font = headerFont;
  ws.getCell('I8').alignment = headerAlignment;

  // データ行
  let rowIndex = 10;
  let totalAmount = 0;

  entries.forEach((entry, idx) => {
    ws.getRow(rowIndex).height = 27;

    const row = ws.getRow(rowIndex);

    // 通番号
    const cellB = row.getCell('B');
    cellB.value = idx + 1;
    cellB.font = dataFont;
    cellB.alignment = { horizontal: 'center', vertical: 'middle' };

    // 廃棄物の種類
    const cellC = row.getCell('C');
    cellC.value = entry.wasteType;
    cellC.font = dataFont;
    cellC.alignment = dataAlignment;

    // 交付日
    const cellD = row.getCell('D');
    cellD.value = entry.deliveryDate;
    cellD.numFmt = 'yyyy/mm/dd';
    cellD.font = dataFont;
    cellD.alignment = { horizontal: 'center', vertical: 'middle' };

    // マニフェスト伝票番号
    const cellE = row.getCell('E');
    cellE.value = entry.manifestNumber;
    cellE.font = dataFont;
    cellE.alignment = dataAlignment;

    // 単位
    const cellF = row.getCell('F');
    cellF.value = entry.unit;
    cellF.font = dataFont;
    cellF.alignment = { horizontal: 'center', vertical: 'middle' };

    // 搬出量
    const cellG = row.getCell('G');
    cellG.value = entry.amount;
    cellG.numFmt = '#,##0.00';
    cellG.font = dataFont;
    cellG.alignment = { horizontal: 'right', vertical: 'middle' };

    // 搬出先
    const cellH = row.getCell('H');
    cellH.value = entry.destination;
    cellH.font = dataFont;
    cellH.alignment = dataAlignment;

    // 備考
    const cellI = row.getCell('I');
    cellI.value = entry.remarks || '';
    cellI.font = dataFont;
    cellI.alignment = dataAlignment;

    totalAmount += entry.amount;
    rowIndex++;
  });

  // 最小20行のデータ行を確保（空行含む）
  const MIN_DATA_ROWS = 20;
  const dataRowCount = Math.max(entries.length, MIN_DATA_ROWS);

  // 空行を追加（データがない行にも罫線を適用するため）
  for (let i = entries.length; i < dataRowCount; i++) {
    const emptyRowIndex = 10 + i;
    ws.getRow(emptyRowIndex).height = 27;

    // 通番号だけ入れる
    const cellB = ws.getCell(`B${emptyRowIndex}`);
    cellB.value = i + 1;
    cellB.font = dataFont;
    cellB.alignment = { horizontal: 'center', vertical: 'middle' };

    // 他のセルにもスタイルを適用
    ['C', 'D', 'E', 'F', 'G', 'H', 'I'].forEach(col => {
      const cell = ws.getCell(`${col}${emptyRowIndex}`);
      cell.font = dataFont;
      cell.alignment = dataAlignment;
    });
  }

  // 合計行（データ行の下）
  const sumRowIndex = 10 + dataRowCount;
  ws.getRow(sumRowIndex).height = 27;

  // 合計ラベル
  ws.mergeCells(`B${sumRowIndex}:F${sumRowIndex}`);
  const sumLabelCell = ws.getCell(`B${sumRowIndex}`);
  sumLabelCell.value = '合　計';
  sumLabelCell.font = headerFont;
  sumLabelCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // 合計値
  const sumCell = ws.getCell(`G${sumRowIndex}`);
  sumCell.value = totalAmount;
  sumCell.numFmt = '#,##0.00';
  sumCell.font = headerFont;
  sumCell.alignment = { horizontal: 'right', vertical: 'middle' };

  // 空セル
  ['H', 'I'].forEach(col => {
    ws.getCell(`${col}${sumRowIndex}`).font = headerFont;
  });

  // 最後に罫線を適用（ヘッダー8行目から合計行まで）
  for (let r = 8; r <= sumRowIndex; r++) {
    ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'].forEach(col => {
      const cell = ws.getCell(`${col}${r}`);
      cell.border = allBorders;
    });
  }

  // 枠外の注記（マニフェスト伝票の取り扱い）
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
    const cell = ws.getCell(`B${noteStartRow + idx}`);
    cell.value = note;
    cell.font = noteFont;
  });

  return ws;
};

// 日付でグループ化
const groupByDate = (entries: WasteEntry[]): Map<string, WasteEntry[]> => {
  const groups = new Map<string, WasteEntry[]>();
  entries.forEach(entry => {
    const dateKey = entry.deliveryDate.toISOString().split('T')[0];
    if (!groups.has(dateKey)) {
      groups.set(dateKey, []);
    }
    groups.get(dateKey)!.push(entry);
  });
  return groups;
};

/**
 * ストックアイテムからExcelワークブックを生成
 */
export const generateWasteReport = async (
  items: StockItem[],
  config: ExportConfig,
  wasteType: string = 'アスファルト殻',
  destination: string = '',
  unit: string = 'ｔ'
): Promise<ExcelJS.Workbook> => {
  // StockItemをWasteEntryに変換（actualTonnageがあるもののみ）
  const entries = items
    .filter(item => item.actualTonnage)
    .map(item => stockItemToWasteEntry(item, wasteType, destination, unit)!)
    .sort((a, b) => a.deliveryDate.getTime() - b.deliveryDate.getTime());

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TonSuuChecker';
  workbook.created = new Date();

  // 日付ごとに集計してサマリーを作成
  const dateGroups = groupByDate(entries);

  // 統括表シート作成
  const summaryEntries: WasteEntry[] = [];
  dateGroups.forEach((groupEntries, dateKey) => {
    const totalAmount = groupEntries.reduce((sum, e) => sum + e.amount, 0);
    summaryEntries.push({
      manifestNumber: '', // サマリーには伝票番号なし
      wasteType,
      deliveryDate: new Date(dateKey),
      unit,
      amount: totalAmount,
      destination
    });
  });

  createWorksheet(workbook, '統括表', config, summaryEntries);

  // 日付ごとの詳細シート作成
  dateGroups.forEach((groupEntries, dateKey) => {
    const date = new Date(dateKey);
    const sheetName = `${date.getDate()}`; // 日付のみ（例: 24, 25, 30）
    createWorksheet(workbook, sheetName, config, groupEntries);
  });

  return workbook;
};

/**
 * Excelファイルをダウンロード
 */
export const downloadExcel = async (
  workbook: ExcelJS.Workbook,
  filename: string = '産廃集計表.xlsx'
): Promise<void> => {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/**
 * ストックアイテムから直接Excelをダウンロード（便利関数）
 */
export const exportWasteReportFromStock = async (
  items: StockItem[],
  config: ExportConfig,
  filename: string = '産廃集計表.xlsx',
  wasteType: string = 'アスファルト殻',
  destination: string = '',
  unit: string = 'ｔ'
): Promise<void> => {
  const workbook = await generateWasteReport(items, config, wasteType, destination, unit);
  await downloadExcel(workbook, filename);
};

/**
 * マニフェスト番号が入力されているアイテムの件数を取得
 */
export const countManifestEntries = (items: StockItem[]): number => {
  return items.filter(item => item.manifestNumber && item.actualTonnage).length;
};
