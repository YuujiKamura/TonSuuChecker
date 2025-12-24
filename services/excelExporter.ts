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

// 列幅設定（テンプレートから抽出）
const COLUMN_WIDTHS = [
  { wch: 2 },      // A列（空）
  { wch: 8.17 },   // B列: 通番号
  { wch: 16.33 },  // C列: 廃棄物の種類
  { wch: 10.67 },  // D列: 交付日
  { wch: 13.17 },  // E列: マニフェスト伝票番号
  { wch: 5.33 },   // F列: 単位
  { wch: 10 },     // G列: 搬出量
  { wch: 18.67 },  // H列: 搬出先
  { wch: 10 },     // I列: 備考
];

// 行高設定（テンプレートから抽出）
const getRowHeights = (dataRowCount: number) => {
  const rows: any[] = [];
  // 行1-5: デフォルト
  for (let i = 0; i < 5; i++) rows.push(undefined);
  // 行6-9: ヘッダー部分 (hpt=18.75)
  for (let i = 5; i < 9; i++) rows.push({ hpt: 18.75 });
  // 行10以降: データ部分 (hpt=21)
  for (let i = 9; i < 9 + dataRowCount + 10; i++) rows.push({ hpt: 21 });
  return rows;
};

// 新規シートを作成（テンプレート形式）
const createSheetWithHeader = (
  _sheetName: string,
  config: ExportConfig,
  dataRowCount: number = 30
) => {
  const ws: any = {};

  // タイトル（B3）
  ws['B3'] = { t: 's', v: '建設廃棄物処理実績集計表' };

  // 工事情報（行6-7）
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

  // 列幅設定
  ws['!cols'] = COLUMN_WIDTHS;

  // 行高設定
  ws['!rows'] = getRowHeights(dataRowCount);

  // 結合セル設定
  ws['!merges'] = [
    { s: { r: 2, c: 1 }, e: { r: 3, c: 8 } },   // B3:I4 タイトル
    { s: { r: 5, c: 5 }, e: { r: 5, c: 6 } },   // F6:G6 受注者名
    { s: { r: 6, c: 2 }, e: { r: 6, c: 4 } },   // C7:E7 工事名
    { s: { r: 6, c: 5 }, e: { r: 6, c: 6 } },   // F7:G7 現場代理人
    { s: { r: 7, c: 1 }, e: { r: 8, c: 1 } },   // B8:B9 通番号
    { s: { r: 7, c: 2 }, e: { r: 8, c: 2 } },   // C8:C9 廃棄物の種類
    { s: { r: 7, c: 3 }, e: { r: 8, c: 3 } },   // D8:D9 交付日
    { s: { r: 7, c: 5 }, e: { r: 8, c: 5 } },   // F8:F9 単位
    { s: { r: 7, c: 6 }, e: { r: 8, c: 6 } },   // G8:G9 搬出量
    { s: { r: 7, c: 7 }, e: { r: 8, c: 7 } },   // H8:H9 搬出先
    { s: { r: 7, c: 8 }, e: { r: 8, c: 8 } },   // I8:I9 備考
  ];

  // 範囲設定（初期は空データ想定）
  ws['!ref'] = 'B3:I44';

  return ws;
};

// エントリーデータをシートに書き込み
const writeEntriesToSheet = (
  ws: any,
  entries: WasteEntry[],
  startRow: number = 10
): void => {
  let rowIndex = startRow;
  let totalAmount = 0;

  entries.forEach((entry, idx) => {
    ws[`B${rowIndex}`] = { t: 'n', v: idx + 1 };
    ws[`C${rowIndex}`] = { t: 's', v: entry.wasteType };
    // 日付はExcelシリアル値で保存し、日付フォーマットを適用
    ws[`D${rowIndex}`] = { t: 'n', v: dateToExcelSerial(entry.deliveryDate), z: 'yyyy/mm/dd' };
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

  const summarySheet = createSheetWithHeader('統括表', config, summaryEntries.length);
  writeEntriesToSheet(summarySheet, summaryEntries);
  xlsx.utils.book_append_sheet(workbook, summarySheet, '統括表');

  // 日付ごとの詳細シート作成
  dateGroups.forEach((groupEntries, dateKey) => {
    const date = new Date(dateKey);
    const sheetName = `${date.getDate()}`; // 日付のみ（例: 24, 25, 30）

    const detailSheet = createSheetWithHeader(sheetName, config, groupEntries.length);
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
