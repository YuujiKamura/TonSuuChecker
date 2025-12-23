import React, { useRef } from 'react';
import { Camera, FolderOpen, Info } from 'lucide-react';

interface ImageUploaderProps {
  onImagesSelected: (images: { base64: string, file: File }[]) => void;
  onCameraOpen: () => void;
  isLoading: boolean;
}

const ImageUploader: React.FC<ImageUploaderProps> = ({ onImagesSelected, onCameraOpen, isLoading }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const fileList = Array.from(files);
      const newSelections: { base64: string, file: File }[] = [];
      let processed = 0;

      fileList.forEach((file: File) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64String = (reader.result as string).split(',')[1];
          newSelections.push({ base64: base64String, file });
          processed++;

          if (processed === fileList.length) {
            onImagesSelected(newSelections);
          }
        };
        reader.readAsDataURL(file);
      });
      e.target.value = '';
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-8">
      <div className="bg-slate-900 rounded-[2.5rem] p-8 border border-slate-800">
        <h2 className="text-xl font-black text-white text-center mb-8 uppercase tracking-widest">
          画像を選択
        </h2>

        {/* 2つのボタンを横に並べる */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* カメラで撮影 */}
          <button
            onClick={() => !isLoading && onCameraOpen()}
            disabled={isLoading}
            className={"flex flex-col items-center justify-center gap-4 p-8 rounded-3xl border-2 border-dashed transition-all " + (
              isLoading 
                ? "opacity-50 cursor-not-allowed border-slate-700 bg-slate-800" 
                : "border-blue-500/50 bg-blue-500/10 hover:bg-blue-500/20 hover:border-blue-500 active:scale-[0.98] cursor-pointer"
            )}
          >
            <div className="bg-blue-600 text-white p-5 rounded-full shadow-lg">
              <Camera size={32} />
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-white">カメラで撮影</p>
              <p className="text-xs text-slate-400 mt-1">その場で撮って解析</p>
            </div>
          </button>

          {/* ファイルから選択 */}
          <button
            onClick={() => !isLoading && fileInputRef.current?.click()}
            disabled={isLoading}
            className={"flex flex-col items-center justify-center gap-4 p-8 rounded-3xl border-2 border-dashed transition-all " + (
              isLoading 
                ? "opacity-50 cursor-not-allowed border-slate-700 bg-slate-800" 
                : "border-yellow-500/50 bg-yellow-500/10 hover:bg-yellow-500/20 hover:border-yellow-500 active:scale-[0.98] cursor-pointer"
            )}
          >
            <div className="bg-yellow-600 text-white p-5 rounded-full shadow-lg">
              <FolderOpen size={32} />
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-white">ファイルから選択</p>
              <p className="text-xs text-slate-400 mt-1">保存済み画像を解析</p>
            </div>
          </button>
        </div>

        <input 
          type="file" 
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*"
          className="hidden"
          multiple
        />

        <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700">
          <div className="flex items-start gap-3">
            <Info size={18} className="text-blue-400 shrink-0 mt-0.5" />
            <p className="text-sm text-slate-400">
              荷姿とナンバーが写るように撮影してください。複数枚選択可能です。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImageUploader;
