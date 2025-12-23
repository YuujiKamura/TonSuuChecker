
import React from 'react';
import { Truck, Camera, Eye } from 'lucide-react';

interface HeaderProps {
  mode: 'manual' | 'monitor';
  setMode: (mode: 'manual' | 'monitor') => void;
  onReset: () => void;
}

const Header: React.FC<HeaderProps> = ({ mode, setMode, onReset }) => {
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
        <div className="hidden xs:block">
          <h1 className="text-sm font-black tracking-tight leading-none">トン数チェッカー</h1>
          <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest mt-0.5">Weight AI Agent</p>
        </div>
      </div>

      {/* Mode Switcher Area (Integrated) */}
      <div className="bg-slate-900 border border-slate-800 p-1 rounded-xl flex items-center w-52 relative overflow-hidden">
        {/* Sliding background */}
        <div 
          className={`absolute inset-y-1 w-[calc(50%-4px)] bg-blue-600 rounded-lg shadow-lg transition-all duration-300 ease-out ${mode === 'monitor' ? 'translate-x-[calc(100%+2px)] bg-green-600' : 'translate-x-[2px]'}`}
        ></div>
        
        <button 
          onClick={() => setMode('manual')}
          className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-[10px] font-black uppercase tracking-widest z-10 transition-colors ${mode === 'manual' ? 'text-white' : 'text-slate-500'}`}
        >
          <Camera size={14} />
          Manual
        </button>
        <button 
          onClick={() => setMode('monitor')}
          className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-[10px] font-black uppercase tracking-widest z-10 transition-colors ${mode === 'monitor' ? 'text-white' : 'text-slate-500'}`}
        >
          <Eye size={14} className={mode === 'monitor' ? 'animate-pulse' : ''} />
          Monitor
        </button>
      </div>

      {/* Status indicator (Right side) */}
      <div className="hidden md:flex items-center gap-3">
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
