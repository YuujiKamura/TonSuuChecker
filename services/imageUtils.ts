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
