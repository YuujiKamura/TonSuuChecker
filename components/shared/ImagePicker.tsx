import React, { useRef } from 'react';
import { Camera, FolderOpen } from 'lucide-react';
import { extractPhotoTakenAt } from '../../services/exifUtils';

interface ImagePickerProps {
  onImageSelect: (base64: string, dataUrl: string, photoTakenAt?: number) => void;
  compact?: boolean;  // コンパクトモード（アイコンのみ）
  disabled?: boolean;
}

const ImagePicker: React.FC<ImagePickerProps> = ({ onImageSelect, compact = false, disabled = false }) => {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      // EXIFから撮影日時を抽出
      const photoTakenAt = await extractPhotoTakenAt(file);
      onImageSelect(base64, dataUrl, photoTakenAt);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  if (compact) {
    // コンパクトモード: 小さなアイコンボタン
    return (
      <div className="flex gap-1.5">
        <label className="flex items-center gap-1 px-2 py-1 bg-slate-900/90 hover:bg-slate-800 text-white text-[10px] font-bold rounded-lg cursor-pointer border border-slate-600">
          <Camera size={12} />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            disabled={disabled}
            className="hidden"
          />
        </label>
        <label className="flex items-center gap-1 px-2 py-1 bg-slate-900/90 hover:bg-slate-800 text-white text-[10px] font-bold rounded-lg cursor-pointer border border-slate-600">
          <FolderOpen size={12} />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            disabled={disabled}
            className="hidden"
          />
        </label>
      </div>
    );
  }

  // 通常モード: 大きなボタン
  return (
    <div className="flex items-center justify-center gap-6">
      <label className={`flex flex-col items-center gap-2 p-4 rounded-xl cursor-pointer transition-colors ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-700'
      }`}>
        <Camera size={24} className="text-blue-400" />
        <span className="text-[10px] text-slate-400">カメラ</span>
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          disabled={disabled}
          className="hidden"
        />
      </label>
      <label className={`flex flex-col items-center gap-2 p-4 rounded-xl cursor-pointer transition-colors ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-700'
      }`}>
        <FolderOpen size={24} className="text-yellow-400" />
        <span className="text-[10px] text-slate-400">ギャラリー</span>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          disabled={disabled}
          className="hidden"
        />
      </label>
    </div>
  );
};

export default ImagePicker;
