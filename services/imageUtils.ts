// 画像圧縮ユーティリティ

/**
 * base64画像を圧縮する
 * @param base64 - 元のbase64画像データ
 * @param maxWidth - 最大幅（デフォルト: 800px）
 * @param quality - JPEG品質（デフォルト: 0.7）
 * @returns 圧縮されたbase64画像データ
 */
export const compressImage = (
  base64: string,
  maxWidth: number = 800,
  quality: number = 0.7
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(base64); // フォールバック
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', quality).split(',')[1];
        resolve(compressed);
      } catch (e) {
        console.error('画像圧縮エラー:', e);
        resolve(base64); // フォールバック
      }
    };
    img.onerror = () => {
      resolve(base64); // フォールバック
    };
    // base64がすでにdata URLの場合とそうでない場合に対応
    if (base64.startsWith('data:')) {
      img.src = base64;
    } else {
      img.src = 'data:image/jpeg;base64,' + base64;
    }
  });
};

/**
 * 画像を指定のアスペクト比で中央クリッピングする
 * @param base64 - 元のbase64画像データ
 * @param aspectRatio - アスペクト比（幅/高さ、例: 4/3 = 1.333）
 * @param maxWidth - 最大幅（デフォルト: 800px）
 * @param quality - JPEG品質（デフォルト: 0.8）
 * @returns クリッピングされたbase64画像データ
 */
export const cropImageToAspectRatio = (
  base64: string,
  aspectRatio: number = 4 / 3,
  maxWidth: number = 800,
  quality: number = 0.8
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(base64);
          return;
        }

        const imgWidth = img.width;
        const imgHeight = img.height;
        const imgAspect = imgWidth / imgHeight;

        let cropWidth: number;
        let cropHeight: number;
        let cropX: number;
        let cropY: number;

        if (imgAspect > aspectRatio) {
          // 画像が横長 → 左右をクリップ
          cropHeight = imgHeight;
          cropWidth = imgHeight * aspectRatio;
          cropX = (imgWidth - cropWidth) / 2;
          cropY = 0;
        } else {
          // 画像が縦長 → 上下をクリップ
          cropWidth = imgWidth;
          cropHeight = imgWidth / aspectRatio;
          cropX = 0;
          cropY = (imgHeight - cropHeight) / 2;
        }

        // 出力サイズを計算
        let outputWidth = cropWidth;
        let outputHeight = cropHeight;
        if (outputWidth > maxWidth) {
          outputHeight = (outputHeight * maxWidth) / outputWidth;
          outputWidth = maxWidth;
        }

        canvas.width = outputWidth;
        canvas.height = outputHeight;

        // クリッピングして描画
        ctx.drawImage(
          img,
          cropX, cropY, cropWidth, cropHeight,  // ソース領域
          0, 0, outputWidth, outputHeight       // 描画先
        );

        const cropped = canvas.toDataURL('image/jpeg', quality).split(',')[1];
        resolve(cropped);
      } catch (e) {
        console.error('画像クリッピングエラー:', e);
        resolve(base64);
      }
    };
    img.onerror = () => {
      resolve(base64);
    };
    if (base64.startsWith('data:')) {
      img.src = base64;
    } else {
      img.src = 'data:image/jpeg;base64,' + base64;
    }
  });
};

/**
 * localStorageの使用量を取得（概算）
 */
export const getLocalStorageUsage = (): { used: number; total: number; percent: number } => {
  let used = 0;
  for (const key in localStorage) {
    if (localStorage.hasOwnProperty(key)) {
      used += localStorage[key].length * 2; // UTF-16 = 2 bytes per char
    }
  }
  const total = 5 * 1024 * 1024; // 約5MB
  return {
    used,
    total,
    percent: Math.round((used / total) * 100)
  };
};
