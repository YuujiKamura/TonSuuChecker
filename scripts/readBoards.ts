// 黒板読み取りバッチスクリプト
import { GoogleGenAI } from "@google/genai";
import * as fs from 'fs';
import * as path from 'path';

const FOLDER_PATH = 'H:\\マイドライブ\\〇東区市道（2工区）舗装補修工事（水防等含）（単価契約）\\６工事写真\\0530小山工区';
const BATCH_SIZE = 10;

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY環境変数を設定してください');
    process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey });

  // JPGファイルを取得
  const files = fs.readdirSync(FOLDER_PATH)
    .filter(f => f.toLowerCase().endsWith('.jpg'))
    .map(f => path.join(FOLDER_PATH, f));

  console.log(`${files.length}枚の画像を処理します`);

  const results: { file: string; boardText: string }[] = [];

  // バッチ処理
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    console.log(`\nバッチ ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(files.length / BATCH_SIZE)} (${batch.length}枚)`);

    const imageParts = batch.map((filePath, idx) => {
      const data = fs.readFileSync(filePath);
      const base64 = data.toString('base64');
      return {
        inlineData: { mimeType: 'image/jpeg', data: base64 }
      };
    });

    const prompt = `
これらの工事写真に写っている黒板（工事看板）の文字を読み取ってください。
各画像について、黒板に書かれている内容を簡潔に抽出してください。

【出力形式】JSON配列
[
  {"index": 0, "boardText": "黒板の内容"},
  {"index": 1, "boardText": "黒板の内容"},
  ...
]

黒板が見えない場合は "boardText": "黒板なし" としてください。
`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash-lite',
        contents: {
          parts: [...imageParts, { text: prompt }]
        },
        config: {
          responseMimeType: "application/json",
          temperature: 0.1
        }
      });

      const text = response.text || '[]';
      const parsed = JSON.parse(text) as { index: number; boardText: string }[];

      parsed.forEach((item) => {
        const fileName = path.basename(batch[item.index] || '');
        results.push({ file: fileName, boardText: item.boardText });
        console.log(`  ${fileName}: ${item.boardText.substring(0, 50)}...`);
      });

    } catch (err: any) {
      console.error(`エラー: ${err.message}`);
      batch.forEach(f => {
        results.push({ file: path.basename(f), boardText: 'エラー' });
      });
    }

    // レート制限対策
    if (i + BATCH_SIZE < files.length) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  // 結果を保存
  const outputPath = path.join(FOLDER_PATH, 'board_readings.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\n結果を保存: ${outputPath}`);

  // 積込状況のものを抽出
  const loadingPhotos = results.filter(r =>
    r.boardText.includes('積込') || r.boardText.includes('積み込')
  );
  console.log(`\n【積込状況の写真】${loadingPhotos.length}枚`);
  loadingPhotos.forEach(p => console.log(`  ${p.file}`));
}

main().catch(console.error);
