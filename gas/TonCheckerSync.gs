/**
 * トン数チェッカー スプレッドシート同期 GAS
 *
 * 使い方:
 * 1. Google スプレッドシートを作成
 * 2. 拡張機能 > Apps Script を開く
 * 3. このコードを貼り付けて保存
 * 4. デプロイ > 新しいデプロイ > ウェブアプリ を選択
 * 5. アクセスできるユーザー: 全員 に設定
 * 6. デプロイしてURLを取得
 * 7. アプリの設定画面でそのURLを入力
 */

// 設定
const CONFIG = {
  SHEET_NAME: 'データ',           // シート名
  IMAGE_FOLDER_NAME: 'TonChecker_Images',  // 画像保存フォルダ名
  HEADERS: [
    '日時',
    'ID',
    'ナンバー',
    '車番',
    'メモ',
    '実測(t)',
    '最大積載(t)',
    'AI推定(t)',
    'AI推定最大(t)',
    '体積(m³)',
    '車両タイプ',
    '積載物',
    '画像',
    '画像URL',
    'ユーザー'
  ]
};

// メイン: POSTリクエスト処理
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    if (data.action === 'addRecord') {
      const result = addRecord(data.record);
      return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ error: 'Unknown action' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// GETリクエスト処理（データ取得用）
function doGet(e) {
  try {
    const data = getAllRecords();
    return ContentService.createTextOutput(JSON.stringify(data))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// レコード追加
function addRecord(record) {
  const sheet = getOrCreateSheet();
  let imageUrl = '';

  // 画像がある場合はDriveに保存
  if (record.imageBase64) {
    imageUrl = saveImageToDrive(record.imageBase64, record.id);
  }

  // 日時フォーマット
  const date = new Date(record.timestamp);
  const dateStr = Utilities.formatDate(date, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');

  // 行データ作成
  const rowData = [
    dateStr,
    record.id,
    record.licensePlate || '',
    record.licenseNumber || '',
    record.memo || '',
    record.actualTonnage || '',
    record.maxCapacity || '',
    record.estimatedTonnage || '',
    record.estimatedMaxCapacity || '',
    record.estimatedVolumeM3 || '',
    record.truckType || '',
    record.materialType || '',
    imageUrl ? `=IMAGE("${imageUrl}")` : '',  // セルに画像表示
    imageUrl,  // URL（参照用）
    record.userName || ''
  ];

  // 既存レコードを検索（IDで）
  const existingRow = findRowById(sheet, record.id);

  if (existingRow > 0) {
    // 更新
    sheet.getRange(existingRow, 1, 1, rowData.length).setValues([rowData]);
  } else {
    // 新規追加
    sheet.appendRow(rowData);
  }

  // 画像列の高さを調整
  const lastRow = existingRow > 0 ? existingRow : sheet.getLastRow();
  sheet.setRowHeight(lastRow, 80);

  return {
    success: true,
    imageUrl: imageUrl,
    row: lastRow
  };
}

// 画像をDriveに保存
function saveImageToDrive(base64Data, id) {
  try {
    // フォルダを取得または作成
    const folder = getOrCreateFolder();

    // Base64デコード
    const blob = Utilities.newBlob(
      Utilities.base64Decode(base64Data),
      'image/jpeg',
      `${id}.jpg`
    );

    // 既存ファイルがあれば削除
    const existingFiles = folder.getFilesByName(`${id}.jpg`);
    while (existingFiles.hasNext()) {
      existingFiles.next().setTrashed(true);
    }

    // ファイル作成
    const file = folder.createFile(blob);

    // 共有設定（リンクを知っている全員が閲覧可）
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    // 画像表示用URL（直接表示できる形式）
    return `https://drive.google.com/uc?id=${file.getId()}`;

  } catch (err) {
    console.error('画像保存エラー:', err);
    return '';
  }
}

// シートを取得または作成
function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
    // ヘッダー設定
    sheet.getRange(1, 1, 1, CONFIG.HEADERS.length).setValues([CONFIG.HEADERS]);
    sheet.getRange(1, 1, 1, CONFIG.HEADERS.length)
      .setBackground('#4a5568')
      .setFontColor('#ffffff')
      .setFontWeight('bold');
    // 列幅調整
    sheet.setColumnWidth(1, 140);  // 日時
    sheet.setColumnWidth(13, 120); // 画像
    sheet.setColumnWidth(14, 200); // 画像URL
    // ヘッダー固定
    sheet.setFrozenRows(1);
  }

  return sheet;
}

// 画像フォルダを取得または作成
function getOrCreateFolder() {
  const folders = DriveApp.getFoldersByName(CONFIG.IMAGE_FOLDER_NAME);

  if (folders.hasNext()) {
    return folders.next();
  }

  return DriveApp.createFolder(CONFIG.IMAGE_FOLDER_NAME);
}

// IDで行を検索
function findRowById(sheet, id) {
  const data = sheet.getDataRange().getValues();
  const idCol = 1; // B列 (0-indexed)

  for (let i = 1; i < data.length; i++) {
    if (data[i][idCol] === id) {
      return i + 1; // 1-indexed
    }
  }

  return -1;
}

// 全レコード取得
function getAllRecords() {
  const sheet = getOrCreateSheet();
  const data = sheet.getDataRange().getValues();

  if (data.length <= 1) {
    return { records: [] };
  }

  const headers = data[0];
  const records = [];

  for (let i = 1; i < data.length; i++) {
    const record = {};
    headers.forEach((header, j) => {
      record[header] = data[i][j];
    });
    records.push(record);
  }

  return {
    version: '2.0',
    syncDate: new Date().toISOString(),
    records
  };
}

// テスト用
function testAddRecord() {
  const testRecord = {
    id: 'test-' + Date.now(),
    timestamp: Date.now(),
    licensePlate: '品川',
    licenseNumber: '1234',
    memo: 'テストデータ',
    actualTonnage: 8.5,
    maxCapacity: 10,
    estimatedTonnage: 8.2,
    estimatedMaxCapacity: 10,
    estimatedVolumeM3: 5.5,
    truckType: '10tダンプ',
    materialType: '土砂',
    userName: 'テストユーザー'
  };

  const result = addRecord(testRecord);
  console.log(result);
}
