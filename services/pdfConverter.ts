// PDF を画像に変換するサービス

import * as pdfjsLib from 'pdfjs-dist';

// ワーカーの設定（publicディレクトリから読み込み）
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

/**
 * PDFの最初のページを画像（base64）に変換
 * @param pdfBase64 PDFのbase64データ
 * @returns 画像のbase64データ（JPEG）
 */
export const convertPdfToImage = async (pdfBase64: string): Promise<string> => {
  // base64をArrayBufferに変換
  const binaryString = atob(pdfBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // PDFを読み込み
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;

  // 最初のページを取得
  const page = await pdf.getPage(1);

  // スケールを設定（解像度調整）
  const scale = 2.0;
  const viewport = page.getViewport({ scale });

  // Canvasを作成
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d')!;
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  // PDFをCanvasに描画
  await page.render({
    canvasContext: context,
    viewport: viewport,
    canvas: canvas
  }).promise;

  // CanvasをJPEGのbase64に変換
  const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
  return dataUrl.split(',')[1];
};

/**
 * ファイルがPDFかどうかを判定
 */
export const isPdf = (mimeType: string): boolean => {
  return mimeType === 'application/pdf';
};
