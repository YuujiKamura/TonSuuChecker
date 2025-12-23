
import React, { useRef } from 'react';
import { Camera, Upload, Info, Zap } from 'lucide-react';

interface ImageUploaderProps {
  onImagesSelected: (images: { base64: string, file: File }[]) => void;
  isLoading: boolean;
}

const ImageUploader: React.FC<ImageUploaderProps> = ({ onImagesSelected, isLoading }) => {
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
      <div className="bg-white rounded-[2.5rem] p-8 shadow-xl border border-slate-200">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
            <Camera className="text-blue-600" size={32} />
            撮影して解析
          </h2>
          <div className="flex items-center gap-2 bg-yellow-400 text-slate-900 px-4 py-2 rounded-full font-black text-xs uppercase animate-pulse shadow-md">
            <Zap size={14} fill="currentColor" /> Auto Start
          </div>
        </div>

        <div 
          onClick={() => !isLoading && fileInputRef.current?.click()}
          className={`aspect-[4/3] rounded-[2rem] border-4 border-dashed flex flex-col items-center justify-center transition-all cursor-pointer bg-slate-50 hover:bg-slate-100 hover:border-blue-400 active:scale-[0.98] ${
            isLoading ? 'opacity-50 cursor-not-allowed border-slate-200' : 'border-slate-300'
          }`}
        >
          <div className="bg-blue-600 text-white p-6 rounded-full shadow-2xl mb-6">
            <Upload size={48} />
          </div>
          <p className="text-xl font-bold text-slate-700">写真を撮る / ファイル選択</p>
          <p className="text-sm text-slate-400 mt-2 font-medium">荷姿とナンバーが写るように撮影してください</p>
        </div>

        <input 
          type="file" 
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*"
          className="hidden"
          multiple
        />

        <div className="mt-8 bg-blue-50 rounded-2xl p-6 border border-blue-100">
           <div className="flex items-start gap-4">
             <div className="bg-blue-600 text-white p-2 rounded-lg shrink-0">
               <Info size={20} />
             </div>
             <div>
               <p className="text-base font-bold text-slate-800">使いかた</p>
               <p className="text-sm text-slate-600 font-medium leading-relaxed mt-1">
                 画像を選ぶとAIが自動的に動き出します。複数枚選ぶと、より立体的な推論が可能になります。
               </p>
             </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default ImageUploader;
