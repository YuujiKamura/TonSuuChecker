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
import { cropImageToAspectRatio } from './imageUtils';

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
// マニフェスト番号または実測値があるものを対象とする
export const stockItemToWasteEntry = (
  item: StockItem,
  wasteType: string = 'アスファルト殻',
  destination: string = '',
  unit: string = 'ｔ'
): WasteEntry | null => {
  // マニフェスト番号も実測値もないものは除外
  if (!item.manifestNumber && !item.actualTonnage) {
    return null;
  }
  return {
    manifestNumber: item.manifestNumber || '',
    wasteType,
    deliveryDate: new Date(item.timestamp),
    unit,
    amount: item.actualTonnage || 0,  // 実測値がなければ0（空欄扱い）
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
  'E': 17,    // マニフェスト伝票番号
  'F': 5,
  'G': 10,
  'H': 17     // 備考
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

  // エントリーデータの幅をチェック
  entries.forEach(entry => {
    if (entry.manifestNumber) {
      maxWidths['E'] = Math.max(maxWidths['E'], getTextWidth(entry.manifestNumber));
    }
    if (entry.wasteType) {
      maxWidths['C'] = Math.max(maxWidths['C'], getTextWidth(entry.wasteType));
    }
    if (entry.remarks) {
      maxWidths['H'] = Math.max(maxWidths['H'], getTextWidth(entry.remarks));
    }
  });

  // 列幅設定（オートフィット適用）
  Object.entries(maxWidths).forEach(([col, width]) => {
    ws.getColumn(col).width = width;
  });

  // タイトル（B1:H1）
  ws.mergeCells('B1:H1');
  const titleCell = ws.getCell('B1');
  titleCell.value = '建設廃棄物処理実績集計表';
  titleCell.style = titleStyle;

  // 工事情報スタイル
  const infoLabelStyle = {
    font: { name: 'ＭＳ ゴシック', size: 10 } as Partial<ExcelJS.Font>,
    alignment: { horizontal: 'left' as const, vertical: 'middle' as const }
  };
  const infoValueStyle = {
    font: { name: 'ＭＳ ゴシック', size: 10 } as Partial<ExcelJS.Font>,
    alignment: { horizontal: 'left' as const, vertical: 'middle' as const }
  };

  // 工事情報（行2-4）
  ws.getCell('B2').value = '工事番号';
  ws.getCell('B2').font = infoLabelStyle.font;
  ws.getCell('B2').alignment = infoLabelStyle.alignment;
  ws.getCell('C2').value = config.projectNumber || '';
  ws.getCell('C2').font = infoValueStyle.font;
  ws.getCell('C2').alignment = infoValueStyle.alignment;
  ws.mergeCells('F2:G2');
  ws.getCell('F2').value = '受注者名';
  ws.getCell('F2').font = infoLabelStyle.font;
  ws.getCell('F2').alignment = infoLabelStyle.alignment;
  ws.getCell('H2').value = config.contractorName || '';
  ws.getCell('H2').font = infoValueStyle.font;
  ws.getCell('H2').alignment = infoValueStyle.alignment;

  ws.getCell('B3').value = '工事名';
  ws.getCell('B3').font = infoLabelStyle.font;
  ws.getCell('B3').alignment = infoLabelStyle.alignment;
  ws.mergeCells('C3:E3');
  ws.getCell('C3').value = config.projectName || '';
  ws.getCell('C3').font = infoValueStyle.font;
  ws.getCell('C3').alignment = infoValueStyle.alignment;
  ws.mergeCells('F3:G3');
  ws.getCell('F3').value = '現場代理人';
  ws.getCell('F3').font = infoLabelStyle.font;
  ws.getCell('F3').alignment = infoLabelStyle.alignment;
  ws.getCell('H3').value = config.siteManager || '';
  ws.getCell('H3').font = infoValueStyle.font;
  ws.getCell('H3').alignment = infoValueStyle.alignment;

  // 搬出先（行4）
  ws.getCell('B4').value = '搬出先';
  ws.getCell('B4').font = infoLabelStyle.font;
  ws.getCell('B4').alignment = infoLabelStyle.alignment;
  ws.mergeCells('C4:H4');
  ws.getCell('C4').value = entries.length > 0 ? entries[0].destination : '';
  ws.getCell('C4').font = infoValueStyle.font;
  ws.getCell('C4').alignment = infoValueStyle.alignment;

  // ヘッダー行（5-6行目）
  ws.mergeCells('B5:B6');
  ws.getCell('B5').value = '通番号';
  ws.getCell('B5').font = headerFont;
  ws.getCell('B5').alignment = headerAlignment;

  ws.mergeCells('C5:C6');
  ws.getCell('C5').value = '廃棄物の種類';
  ws.getCell('C5').font = headerFont;
  ws.getCell('C5').alignment = headerAlignment;

  ws.mergeCells('D5:D6');
  ws.getCell('D5').value = '交付日';
  ws.getCell('D5').font = headerFont;
  ws.getCell('D5').alignment = headerAlignment;

  // マニフェスト伝票番号は2行に分割
  ws.getCell('E5').value = 'マニフェスト';
  ws.getCell('E5').font = headerFont;
  ws.getCell('E5').alignment = headerAlignment;
  ws.getCell('E6').value = '伝票番号';
  ws.getCell('E6').font = headerFont;
  ws.getCell('E6').alignment = headerAlignment;

  ws.mergeCells('F5:F6');
  ws.getCell('F5').value = '単位';
  ws.getCell('F5').font = headerFont;
  ws.getCell('F5').alignment = headerAlignment;

  ws.mergeCells('G5:G6');
  ws.getCell('G5').value = '搬出量';
  ws.getCell('G5').font = headerFont;
  ws.getCell('G5').alignment = headerAlignment;

  ws.mergeCells('H5:H6');
  ws.getCell('H5').value = '備　考';
  ws.getCell('H5').font = headerFont;
  ws.getCell('H5').alignment = headerAlignment;

  // 行高さを統一（ヘッダー〜合計行まで、注意書きは除く）
  const lastDataRow = 7 + Math.max(entries.length, 20); // 合計行
  for (let i = 1; i <= lastDataRow; i++) {
    ws.getRow(i).height = 27;
  }

  // データ行（7行目から）
  let rowIndex = 7;
  let totalAmount = 0;

  entries.forEach((entry, idx) => {
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

    // 搬出量（実測値がある場合のみ）
    const cellG = row.getCell('G');
    cellG.value = entry.amount > 0 ? entry.amount : '';
    if (entry.amount > 0) {
      cellG.numFmt = '#,##0.00';
    }
    cellG.font = dataFont;
    cellG.alignment = { horizontal: 'right', vertical: 'middle' };

    // 備考（H列に移動、搬出先は上部に記載済み）
    const cellH = row.getCell('H');
    cellH.value = entry.remarks || '';
    cellH.font = dataFont;
    cellH.alignment = dataAlignment;

    if (entry.amount > 0) {
      totalAmount += entry.amount;
    }
    rowIndex++;
  });

  // 最小20行のデータ行を確保（空行含む）
  const MIN_DATA_ROWS = 20;
  const dataRowCount = Math.max(entries.length, MIN_DATA_ROWS);

  // 空行を追加（データがない行にも罫線を適用するため）
  for (let i = entries.length; i < dataRowCount; i++) {
    const emptyRowIndex = 7 + i;

    // 通番号だけ入れる
    const cellB = ws.getCell(`B${emptyRowIndex}`);
    cellB.value = i + 1;
    cellB.font = dataFont;
    cellB.alignment = { horizontal: 'center', vertical: 'middle' };

    // 他のセルにもスタイルを適用
    ['C', 'D', 'E', 'F', 'G', 'H'].forEach(col => {
      const cell = ws.getCell(`${col}${emptyRowIndex}`);
      cell.font = dataFont;
      cell.alignment = dataAlignment;
    });
  }

  // 合計行（データ行の下）
  const sumRowIndex = 7 + dataRowCount;

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

  // 空セル（備考欄）
  ws.getCell(`H${sumRowIndex}`).font = headerFont;

  // 最後に罫線を適用（ヘッダー5行目から合計行まで）
  for (let r = 5; r <= sumRowIndex; r++) {
    ['B', 'C', 'D', 'E', 'F', 'G', 'H'].forEach(col => {
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
  // StockItemをWasteEntryに変換（manifestNumberまたはactualTonnageがあるもの）
  const entries = items
    .filter(item => item.manifestNumber || item.actualTonnage)
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
 * Excel出力対象のアイテム件数を取得（伝票番号または実測値があるもの）
 */
export const countExportableEntries = (items: StockItem[]): number => {
  return items.filter(item => item.manifestNumber || item.actualTonnage).length;
};

// =====================================================
// 写真付きレポート生成（GASPhotoAIManager互換レイアウト）
// =====================================================

// 写真レポート用の定数
const PHOTO_COL_WIDTH = 56;      // 写真列幅（約56.1pt相当）
const LABEL_COL_WIDTH = 11;      // ラベル列幅
const VALUE_COL_WIDTH = 29;      // 値列幅（約28.6pt相当）
const PHOTO_ROWS = 10;           // 写真ブロックあたりの行数
const ROW_HEIGHT = 26;           // 行高さ（pt）
const PHOTOS_PER_PAGE = 3;       // 1ページあたりの写真数

// 写真レポート用の罫線スタイル
const hairBorder: Partial<ExcelJS.Border> = { style: 'hair', color: { argb: 'FF000000' } };
const photoReportBorders: Partial<ExcelJS.Borders> = {
  top: hairBorder,
  left: hairBorder,
  bottom: hairBorder,
  right: hairBorder
};

// ラベルセルスタイル
const labelCellStyle: Partial<ExcelJS.Style> = {
  font: { name: 'ＭＳ ゴシック', size: 10, bold: true },
  alignment: { horizontal: 'center', vertical: 'middle' },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } },
  border: photoReportBorders
};

// 値セルスタイル
const valueCellStyle: Partial<ExcelJS.Style> = {
  font: { name: 'ＭＳ ゴシック', size: 10 },
  alignment: { horizontal: 'left', vertical: 'middle', wrapText: true },
  border: photoReportBorders
};

/**
 * 日時をフォーマット（yyyy/mm/dd HH:MM形式）
 */
const formatDateTime = (timestamp: number | undefined): string => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd} ${hh}:${min}`;
};

/**
 * 写真付きレポート用ワークシートを作成
 */
const createPhotoReportWorksheet = async (
  workbook: ExcelJS.Workbook,
  sheetName: string,
  items: StockItem[]
): Promise<ExcelJS.Worksheet> => {
  const ws = workbook.addWorksheet(sheetName);

  // 列幅設定
  ws.getColumn(1).width = PHOTO_COL_WIDTH;  // A列: 写真
  ws.getColumn(2).width = LABEL_COL_WIDTH;  // B列: ラベル
  ws.getColumn(3).width = VALUE_COL_WIDTH;  // C列: 値

  // ページ設定（A4縦向き）
  ws.pageSetup = {
    paperSize: 9,  // A4
    orientation: 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,  // 高さは自動
    margins: {
      left: 0.4,
      right: 0.4,
      top: 0.4,
      bottom: 0.4,
      header: 0.3,
      footer: 0.3
    }
  };

  // 各アイテムを配置（全エントリーを出力）
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const blockIndex = index % PHOTOS_PER_PAGE;
    const startRow = blockIndex * PHOTO_ROWS + 1;

    // 行高さを設定
    for (let i = startRow; i < startRow + PHOTO_ROWS; i++) {
      ws.getRow(i).height = ROW_HEIGHT;
    }

    // 写真列（A列）の罫線設定
    for (let i = startRow; i < startRow + PHOTO_ROWS; i++) {
      const cell = ws.getCell(`A${i}`);
      cell.border = {
        left: hairBorder,
        right: hairBorder,
        top: i === startRow ? hairBorder : undefined,
        bottom: i === startRow + PHOTO_ROWS - 1 ? hairBorder : undefined
      };
    }

    // 画像を追加（base64画像がある場合）
    if (item.base64Images && item.base64Images.length > 0) {
      try {
        // base64からdata URLプレフィックスを除去
        let base64Data = item.base64Images[0];
        if (base64Data.startsWith('data:')) {
          base64Data = base64Data.split(',')[1];
        }

        // 4:3（CALS規格）でクリッピング
        const croppedBase64 = await cropImageToAspectRatio(base64Data, 4 / 3, 800, 0.8);

        const imageId = workbook.addImage({
          base64: croppedBase64,
          extension: 'jpeg'
        });

        ws.addImage(imageId, {
          tl: { col: 0, row: startRow - 1 } as ExcelJS.Anchor,
          br: { col: 1, row: startRow - 1 + PHOTO_ROWS } as ExcelJS.Anchor,
          editAs: 'absolute'
        });
      } catch (e) {
        console.warn('画像の埋め込みに失敗:', e);
      }
    }

    // メタデータ配置（B列: ラベル、C列: 値）
    // 配置する行: 2行目、4行目、6行目、8行目（各ブロック内）
    const metaRows = [
      { row: startRow + 1, label: '日時', value: formatDateTime(item.photoTakenAt || item.timestamp) },
      { row: startRow + 3, label: '伝票', value: item.manifestNumber || '' },
      { row: startRow + 5, label: '実測', value: item.actualTonnage ? `${item.actualTonnage} t` : '' },
      { row: startRow + 7, label: '備考', value: item.memo || '' }
    ];

    metaRows.forEach(({ row, label, value }) => {
      // ラベルセル（B列）
      const labelCell = ws.getCell(`B${row}`);
      labelCell.value = label;
      labelCell.style = labelCellStyle;

      // 値セル（C列）
      const valueCell = ws.getCell(`C${row}`);
      valueCell.value = value;
      valueCell.style = valueCellStyle;
    });

    // B列とC列の空行にも罫線を適用（ブロック全体を囲む）
    for (let i = startRow; i < startRow + PHOTO_ROWS; i++) {
      const isMetaRow = metaRows.some(m => m.row === i);
      if (!isMetaRow) {
        // ラベル列（B列）
        const cellB = ws.getCell(`B${i}`);
        cellB.border = {
          left: hairBorder,
          right: hairBorder,
          top: i === startRow ? hairBorder : undefined,
          bottom: i === startRow + PHOTO_ROWS - 1 ? hairBorder : undefined
        };
        // 値列（C列）
        const cellC = ws.getCell(`C${i}`);
        cellC.border = {
          left: hairBorder,
          right: hairBorder,
          top: i === startRow ? hairBorder : undefined,
          bottom: i === startRow + PHOTO_ROWS - 1 ? hairBorder : undefined
        };
      }
    }

    // ページ区切り（3枚ごと）
    if ((index + 1) % PHOTOS_PER_PAGE === 0 && index < items.length - 1) {
      ws.getRow(startRow + PHOTO_ROWS - 1).addPageBreak();
    }
  }

  return ws;
};

/**
 * 写真付きExcelワークブックを生成
 * GASPhotoAIManager互換レイアウト: A4縦向き、1ページ3枚の写真
 */
export const generatePhotoReport = async (
  items: StockItem[],
  config: ExportConfig
): Promise<ExcelJS.Workbook> => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TonSuuChecker';
  workbook.created = new Date();

  // 画像があるアイテムのみをフィルタリング
  const itemsWithPhotos = items.filter(
    item => item.base64Images && item.base64Images.length > 0
  );

  if (itemsWithPhotos.length === 0) {
    // 画像がない場合は空のシートを作成
    const ws = workbook.addWorksheet('写真レポート');
    ws.getCell('A1').value = '写真データがありません';
    return workbook;
  }

  // 日付でグループ化してシートを作成
  const dateGroups = new Map<string, StockItem[]>();
  itemsWithPhotos.forEach(item => {
    const dateKey = new Date(item.photoTakenAt || item.timestamp)
      .toISOString()
      .split('T')[0];
    if (!dateGroups.has(dateKey)) {
      dateGroups.set(dateKey, []);
    }
    dateGroups.get(dateKey)!.push(item);
  });

  // 日付ごとにシートを作成（全エントリーを出力）
  const sortedDates = Array.from(dateGroups.keys()).sort();
  for (const dateKey of sortedDates) {
    const groupItems = dateGroups.get(dateKey)!;
    const date = new Date(dateKey);
    const sheetName = `${date.getMonth() + 1}月${date.getDate()}日`;
    await createPhotoReportWorksheet(workbook, sheetName, groupItems);
  }

  return workbook;
};

/**
 * 写真付きレポートをダウンロード（便利関数）
 */
export const exportPhotoReportFromStock = async (
  items: StockItem[],
  config: ExportConfig,
  filename: string = '写真レポート.xlsx'
): Promise<void> => {
  const workbook = await generatePhotoReport(items, config);
  await downloadExcel(workbook, filename);
};

/**
 * 写真レポート対象のアイテム件数を取得（画像があるもの）
 */
export const countPhotoReportEntries = (items: StockItem[]): number => {
  return items.filter(item => item.base64Images && item.base64Images.length > 0).length;
};
