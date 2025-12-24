const XLSX = require('xlsx');

const filePath = 'H:\\マイドライブ\\過去の現場_元請\\2024.0819 市道沈目舞原第3号線舗装補修工事\\２竣工時\\1 実施数量\\産廃集計表.xls';

const workbook = XLSX.readFile(filePath, { cellStyles: true, cellDates: true });

console.log('=== シート名 ===');
console.log(workbook.SheetNames);

workbook.SheetNames.forEach(sheetName => {
  console.log(`\n=== シート: ${sheetName} ===`);
  const sheet = workbook.Sheets[sheetName];

  // 範囲
  console.log('範囲:', sheet['!ref']);

  // 列幅
  if (sheet['!cols']) {
    console.log('列幅:');
    sheet['!cols'].forEach((col, idx) => {
      if (col) {
        const colLetter = String.fromCharCode(65 + idx);
        console.log(`  ${colLetter}: wch=${col.wch}, wpx=${col.wpx}, width=${col.width}`);
      }
    });
  }

  // 行高
  if (sheet['!rows']) {
    console.log('行高:');
    sheet['!rows'].forEach((row, idx) => {
      if (row) {
        console.log(`  行${idx + 1}: hpt=${row.hpt}, hpx=${row.hpx}`);
      }
    });
  }

  // 結合セル
  if (sheet['!merges']) {
    console.log('結合セル:');
    sheet['!merges'].forEach((merge) => {
      const startCol = String.fromCharCode(65 + merge.s.c);
      const endCol = String.fromCharCode(65 + merge.e.c);
      console.log(`  ${startCol}${merge.s.r + 1}:${endCol}${merge.e.r + 1}`);
    });
  }

  // セル内容
  console.log('\n--- セル内容 (B1〜I20) ---');
  for (let row = 1; row <= 20; row++) {
    for (const col of ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']) {
      const addr = `${col}${row}`;
      const cell = sheet[addr];
      if (cell) {
        let info = `${addr}: "${cell.v}"`;
        if (cell.s) {
          info += ` style=${JSON.stringify(cell.s)}`;
        }
        console.log(info);
      }
    }
  }
});
