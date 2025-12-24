/**
 * 建設廃棄物処理実績集計表 Excel出力サービス
 * テンプレートExcel構造に基づいてストックデータを埋め込みExcelを生成する
 * 
 * テンプレート構造（列）:
 * B列: 通番号
 * C列: 廃棄物の種類
 * D列: 交付日（Excelシリアル値）
 * E列: マニフェスト伝票番号
 * F列: 単位（ｔ、㎥）
 * G列: 搬出量
 * H列: 搬出先
 * I列: 備考
 * 
 * データ開始行: 10行目
 */

import { StockItem } from '../types';

// XLSXは動的インポート（アプリ起動時の負荷を避けるため）
let XLSX: typeof import('xlsx') | null = null;

const loadXLSX = async () => {
  if (!XLSX) {
    XLSX = await import('xlsx');
  }
  return XLSX;
};

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

// 日付をExcelシリアル値に変換
const dateToExcelSerial = (date: Date): number => {
  // Excel基準日: 1900/1/1 = 1（ただし1900/2/29バグがあるため+1）
  const excelEpoch = new Date(1899, 11, 30);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((date.getTime() - excelEpoch.getTime()) / msPerDay);
};

// 新規シートを作成（テンプレート形式）
const createSheetWithHeader = (
  _sheetName: string,
  config: ExportConfig
) => {
  const ws: Record<string, unknown> = {};

  // タイトル（B3:I4結合）
  ws['B3'] = { t: 's', v: '建設廃棄物処理実績集計表' };

  // 工事情報
  ws['B6'] = { t: 's', v: '工事番号' };
  ws['C6'] = { t: 's', v: config.projectNumber || '' };
  ws['F6'] = { t: 's', v: '受注者名' };
  ws['H6'] = { t: 's', v: config.contractorName || '' };
  
  ws['B7'] = { t: 's', v: '工事名' };
  ws['C7'] = { t: 's', v: config.projectName || '' };
  ws['F7'] = { t: 's', v: '現場代理人' };
  ws['H7'] = { t: 's', v: config.siteManager || '' };

  // ヘッダー行（8-9行目）
  ws['B8'] = { t: 's', v: '通番号' };
  ws['C8'] = { t: 's', v: '廃棄物の種類' };
  ws['D8'] = { t: 's', v: '交付日' };
  ws['E8'] = { t: 's', v: 'マニフェスト' };
  ws['E9'] = { t: 's', v: '伝票番号' };
  ws['F8'] = { t: 's', v: '単位' };
  ws['G8'] = { t: 's', v: '搬出量' };
  ws['H8'] = { t: 's', v: '搬出先' };
  ws['I8'] = { t: 's', v: '備　考' };

  // 結合セル設定
  ws['!merges'] = [
    { s: { r: 2, c: 1 }, e: { r: 3, c: 8 } },   // B3:I4 タイトル
    { s: { r: 5, c: 5 }, e: { r: 5, c: 6 } },   // F6:G6
    { s: { r: 6, c: 2 }, e: { r: 6, c: 4 } },   // C7:E7
    { s: { r: 6, c: 5 }, e: { r: 6, c: 6 } },   // F7:G7
    { s: { r: 7, c: 1 }, e: { r: 8, c: 1 } },   // B8:B9
    { s: { r: 7, c: 2 }, e: { r: 8, c: 2 } },   // C8:C9
    { s: { r: 7, c: 3 }, e: { r: 8, c: 3 } },   // D8:D9
    { s: { r: 7, c: 5 }, e: { r: 8, c: 5 } },   // F8:F9
    { s: { r: 7, c: 6 }, e: { r: 8, c: 6 } },   // G8:G9
    { s: { r: 7, c: 7 }, e: { r: 8, c: 7 } },   // H8:H9
    { s: { r: 7, c: 8 }, e: { r: 8, c: 8 } },   // I8:I9
  ];

  // 範囲設定（初期は空データ想定）
  ws['!ref'] = 'B3:I44';

  return ws;
};

// エントリーデータをシートに書き込み
const writeEntriesToSheet = (
  ws: Record<string, unknown>,
  entries: WasteEntry[],
  startRow: number = 10
): void => {
  let rowIndex = startRow;
  let totalAmount = 0;

  entries.forEach((entry, idx) => {
    ws[`B${rowIndex}`] = { t: 'n', v: idx + 1 };
    ws[`C${rowIndex}`] = { t: 's', v: entry.wasteType };
    ws[`D${rowIndex}`] = { t: 'n', v: dateToExcelSerial(entry.deliveryDate) };
    ws[`E${rowIndex}`] = { t: 's', v: entry.manifestNumber };
    ws[`F${rowIndex}`] = { t: 's', v: entry.unit };
    ws[`G${rowIndex}`] = { t: 'n', v: entry.amount };
    ws[`H${rowIndex}`] = { t: 's', v: entry.destination };
    if (entry.remarks) {
      ws[`I${rowIndex}`] = { t: 's', v: entry.remarks };
    }

    totalAmount += entry.amount;
    rowIndex++;
  });

  // 合計行
  if (entries.length > 0) {
    ws[`G${rowIndex}`] = { t: 'n', v: totalAmount };
  }

  // 範囲を更新
  const endRow = Math.max(rowIndex, 44);
  ws['!ref'] = `B3:I${endRow}`;
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
) => {
  const xlsx = await loadXLSX();

  // StockItemをWasteEntryに変換（actualTonnageがあるもののみ）
  const entries = items
    .filter(item => item.actualTonnage)
    .map(item => stockItemToWasteEntry(item, wasteType, destination, unit)!)
    .sort((a, b) => a.deliveryDate.getTime() - b.deliveryDate.getTime());

  const workbook = xlsx.utils.book_new();

  // 統括表シート作成
  const summarySheet = createSheetWithHeader('統括表', config);

  // 日付ごとに集計してサマリーを作成
  const dateGroups = groupByDate(entries);
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

  writeEntriesToSheet(summarySheet, summaryEntries);
  xlsx.utils.book_append_sheet(workbook, summarySheet, '統括表');

  // 日付ごとの詳細シート作成
  dateGroups.forEach((groupEntries, dateKey) => {
    const date = new Date(dateKey);
    const sheetName = `${date.getMonth() + 1}-${date.getDate()}`; // 例: 12-24

    const detailSheet = createSheetWithHeader(sheetName, config);
    writeEntriesToSheet(detailSheet, groupEntries);
    xlsx.utils.book_append_sheet(workbook, detailSheet, sheetName);
  });

  return workbook;
};

/**
 * Excelファイルをダウンロード
 */
export const downloadExcel = async (
  workbook: any,
  filename: string = '産廃集計表.xlsx'
): Promise<void> => {
  const xlsx = await loadXLSX();
  xlsx.writeFile(workbook, filename);
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

