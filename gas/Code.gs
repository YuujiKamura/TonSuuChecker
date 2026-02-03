// Google Apps Script - トン数チェッカー用
// スプレッドシートにデプロイして使用

function doGet(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = sheet.getRange('A1').getValue();

  return ContentService
    .createTextOutput(data || '{"items":[]}')
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = e.parameter.data;

  // A1に最新データを保存
  sheet.getRange('A1').setValue(data);

  // B列に履歴として追記（最大100件）
  var lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 2).setValue(new Date().toISOString());
  sheet.getRange(lastRow + 1, 3).setValue(data);

  // 100件超えたら古いのを削除
  if (lastRow > 100) {
    sheet.deleteRow(2);
  }

  return ContentService
    .createTextOutput(JSON.stringify({success: true}))
    .setMimeType(ContentService.MimeType.JSON);
}
