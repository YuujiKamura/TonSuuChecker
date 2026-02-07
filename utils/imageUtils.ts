import { extractPhotoTakenAt } from '../services/exifUtils';

// --- Image file reading helper ---
export const readImageFile = (file: File): Promise<{ base64: string; dataUrl: string; photoTakenAt?: number }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = async () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      const photoTakenAt = await extractPhotoTakenAt(file);
      resolve({ base64, dataUrl, photoTakenAt });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};
