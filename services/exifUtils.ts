/**
 * EXIF情報からの撮影日時抽出ユーティリティ
 */
import exifr from 'exifr';

/**
 * Base64画像またはFileオブジェクトからEXIF撮影日時を抽出
 * @param input Base64文字列（data:image/...形式も可）、またはFileオブジェクト
 * @returns 撮影日時のUnixタイムスタンプ（ミリ秒）、取得できなければundefined
 */
export async function extractPhotoTakenAt(input: string | File): Promise<number | undefined> {
  try {
    let source: string | File = input;

    // Base64文字列の場合、data URL形式でない場合は変換
    if (typeof input === 'string') {
      if (!input.startsWith('data:')) {
        source = `data:image/jpeg;base64,${input}`;
      }
    }

    // EXIFからDateTimeOriginalまたはDateTimeを取得
    const exifData = await exifr.parse(source, {
      pick: ['DateTimeOriginal', 'DateTime', 'CreateDate', 'ModifyDate'],
    });

    if (!exifData) {
      return undefined;
    }

    // 優先順位: DateTimeOriginal > CreateDate > DateTime > ModifyDate
    const dateValue = exifData.DateTimeOriginal
      || exifData.CreateDate
      || exifData.DateTime
      || exifData.ModifyDate;

    if (!dateValue) {
      return undefined;
    }

    // Dateオブジェクトの場合はそのまま、文字列の場合はパース
    if (dateValue instanceof Date) {
      return dateValue.getTime();
    }

    // EXIF形式の文字列（"YYYY:MM:DD HH:MM:SS"）をパース
    if (typeof dateValue === 'string') {
      // "YYYY:MM:DD HH:MM:SS" を "YYYY-MM-DD HH:MM:SS" に変換
      const normalized = dateValue.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
      const parsed = new Date(normalized);
      if (!isNaN(parsed.getTime())) {
        return parsed.getTime();
      }
    }

    return undefined;
  } catch (err) {
    console.warn('EXIF抽出エラー:', err);
    return undefined;
  }
}

/**
 * 撮影日時または登録日時を取得するヘルパー
 * photoTakenAtが存在すればそれを、なければtimestampを使用
 */
export function getEffectiveDateTime(item: { photoTakenAt?: number; timestamp: number }): number {
  return item.photoTakenAt ?? item.timestamp;
}

/**
 * 日時を「yyyy/mm/dd HH:MM」形式でフォーマット
 */
export function formatDateTime(timestamp: number): string {
  const d = new Date(timestamp);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  return `${year}/${month}/${day} ${hours}:${minutes}`;
}

/**
 * 日時を「yyyy/mm/dd」形式でフォーマット（日付のみ）
 */
export function formatDateOnly(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}
