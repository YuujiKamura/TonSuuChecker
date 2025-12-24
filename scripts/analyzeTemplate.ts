/**
 * テンプレートExcel解析スクリプト
 * 産廃集計表テンプレートの構造を解析し、データ埋め込み位置を特定する
 */
import XLSX from 'xlsx';

const TEMPLATE_PATH = 'H:\\マイドライブ\\過去の現場_元請\\2024.0819 市道沈目舞原第3号線舗装補修工事\\２竣工時\\1 実施数量\\産廃集計表.xls';

function analyzeTemplate() {
  console.log('='.repeat(60));
  console.log('テンプレートExcel解析');
  console.log('='.repeat(60));
  console.log(`ファイル: ${TEMPLATE_PATH}`);
  console.log('');

  try {
    // Excelファイルを読み込む
    const workbook = XLSX.readFile(TEMPLATE_PATH);

    console.log('--- シート一覧 ---');
    workbook.SheetNames.forEach((name, idx) => {
      console.log(`  ${idx + 1}. ${name}`);
    });
    console.log('');

    // 各シートの内容を解析
    workbook.SheetNames.forEach((sheetName) => {
      console.log('='.repeat(60));
      console.log(`シート: ${sheetName}`);
      console.log('='.repeat(60));

      const sheet = workbook.Sheets[sheetName];
      const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1');

      console.log(`範囲: ${sheet['!ref']}`);
      console.log(`行: ${range.s.r + 1} ~ ${range.e.r + 1}`);
      console.log(`列: ${XLSX.utils.encode_col(range.s.c)} ~ ${XLSX.utils.encode_col(range.e.c)}`);
      console.log('');

      // セル内容を表示（最初の30行程度）
      console.log('--- セル内容（先頭30行） ---');
      for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + 29); r++) {
        const rowData: string[] = [];
        for (let c = range.s.c; c <= range.e.c; c++) {
          const cellRef = XLSX.utils.encode_cell({ r, c });
          const cell = sheet[cellRef];
          if (cell) {
            rowData.push(`${cellRef}:${JSON.stringify(cell.v).substring(0, 30)}`);
          }
        }
        if (rowData.length > 0) {
          console.log(`行${r + 1}: ${rowData.join(' | ')}`);
        }
      }
      console.log('');

      // JSON形式で出力（デバッグ用）
      const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      console.log('--- JSON形式（先頭20行） ---');
      json.slice(0, 20).forEach((row, idx) => {
        console.log(`${idx + 1}: ${JSON.stringify(row)}`);
      });
      console.log('');
    });

    // 結合セル情報
    workbook.SheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      if (sheet['!merges']) {
        console.log(`--- 結合セル（${sheetName}） ---`);
        sheet['!merges'].forEach((merge, idx) => {
          const start = XLSX.utils.encode_cell(merge.s);
          const end = XLSX.utils.encode_cell(merge.e);
          console.log(`  ${idx + 1}. ${start}:${end}`);
        });
        console.log('');
      }
    });

  } catch (error) {
    console.error('エラー:', error);
  }
}

analyzeTemplate();

