import React from 'react';
import { Truck } from 'lucide-react';

interface HeaderProps {
  onReset: () => void;
}

const Header: React.FC<HeaderProps> = ({ onReset }) => {
  return (
    <header className="bg-slate-950/90 backdrop-blur-xl text-white h-16 flex items-center justify-between px-4 sticky top-0 z-[100] border-b border-slate-800 shadow-2xl">
      {/* Logo Area */}
      <div 
        className="flex items-center gap-2 cursor-pointer active:scale-95 transition-transform"
        onClick={onReset}
      >
        <div className="bg-yellow-500 p-1.5 rounded-lg shadow-inner">
          <Truck className="text-slate-900" size={20} />
        </div>
        <div>
          <h1 className="text-sm font-black tracking-tight leading-none">トン数チェッカー</h1>
          <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest mt-0.5">Weight AI Agent</p>
        </div>
      </div>

      {/* Status indicator (Right side) */}
      <div className="flex items-center gap-3">
        <div className="flex flex-col items-end">
          <span className="text-[8px] font-black text-blue-500 uppercase tracking-widest">System Status</span>
          <span className="text-[10px] font-black text-slate-300 uppercase">AI Engine Active</span>
        </div>
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_#22c55e]"></div>
      </div>
    </header>
  );
};

export default Header;
