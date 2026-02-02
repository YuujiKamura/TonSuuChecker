import React from 'react';
import { ArrowLeft } from 'lucide-react';

interface FloatingBackButtonProps {
  onClick: () => void;
}

const FloatingBackButton: React.FC<FloatingBackButtonProps> = ({ onClick }) => {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 right-6 z-[200] w-14 h-14 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-full shadow-2xl flex items-center justify-center text-white active:scale-95 transition-all"
      aria-label="戻る"
    >
      <ArrowLeft size={24} />
    </button>
  );
};

export default FloatingBackButton;
