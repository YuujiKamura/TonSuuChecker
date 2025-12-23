import React from 'react';
import { Brain, Archive, X } from 'lucide-react';

interface CaptureChoiceProps {
  imageUrl: string;
  onAnalyze: () => void;
  onStock: () => void;
  onCancel: () => void;
}

const CaptureChoice: React.FC<CaptureChoiceProps> = ({ imageUrl, onAnalyze, onStock, onCancel }) => {
  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex flex-col">
      <div className="flex-grow flex items-center justify-center p-4">
        <div className="relative max-w-2xl w-full">
          <img
            src={imageUrl}
            className="w-full rounded-3xl border-4 border-slate-700 shadow-2xl"
            alt="Captured"
          />
          <button
            onClick={onCancel}
            className="absolute top-4 right-4 p-3 rounded-full bg-black/50 text-white hover:bg-black/70 transition-all"
          >
            <X size={24} />
          </button>
        </div>
      </div>

      <div className="p-6 pb-12 bg-slate-950/80 backdrop-blur-xl border-t border-slate-800">
        <p className="text-center text-slate-400 text-sm mb-6">この画像をどうしますか？</p>
        <div className="flex gap-4 max-w-md mx-auto">
          <button
            onClick={onAnalyze}
            className="flex-1 flex flex-col items-center gap-3 p-6 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-all active:scale-95 shadow-lg"
          >
            <Brain size={32} />
            <span className="text-lg">AI解析</span>
            <span className="text-xs text-blue-200">今すぐ推定</span>
          </button>
          <button
            onClick={onStock}
            className="flex-1 flex flex-col items-center gap-3 p-6 rounded-2xl bg-slate-700 hover:bg-slate-600 text-white font-bold transition-all active:scale-95 shadow-lg border border-slate-600"
          >
            <Archive size={32} />
            <span className="text-lg">ストック</span>
            <span className="text-xs text-slate-400">後でタグ付け</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default CaptureChoice;
