
import React, { useState } from 'react';
import { EstimationResult } from '../types';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell } from 'recharts';
import { Truck, Layers, Info, CheckCircle2, Save, Scale, CreditCard, Edit2, Activity, Check } from 'lucide-react';

interface AnalysisResultProps {
  result: EstimationResult;
  imageUrls: string[];
  actualTonnage?: number;
  onSaveActualTonnage: (value: number) => void;
  onUpdateLicensePlate: (plate: string, number: string) => void;
}

const COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6'];

const AnalysisResult: React.FC<AnalysisResultProps> = ({ result, imageUrls, actualTonnage, onSaveActualTonnage, onUpdateLicensePlate }) => {
  const [inputValue, setInputValue] = useState(actualTonnage?.toString() || '');
  const [isSaved, setIsSaved] = useState(!!actualTonnage);
  const [isEditingPlate, setIsEditingPlate] = useState(false);
  const [tempNumber, setTempNumber] = useState(result.licenseNumber || '');
  const [tempPlate, setTempPlate] = useState(result.licensePlate || '');

  const handleSave = () => {
    const val = parseFloat(inputValue);
    if (!isNaN(val)) {
      onSaveActualTonnage(val);
      setIsSaved(true);
    }
  };

  const handlePlateSave = () => {
    onUpdateLicensePlate(tempPlate, tempNumber);
    setIsEditingPlate(false);
  };

  const errorRate = actualTonnage 
    ? ((result.estimatedTonnage - actualTonnage) / actualTonnage) * 100 
    : null;

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-8 pb-40">
      {/* 推定重量メイン表示 */}
      <div className="bg-slate-900 text-white p-10 rounded-[3rem] shadow-2xl border border-slate-800 relative overflow-hidden">
        <div className="absolute -right-8 -top-8 opacity-10">
          <Activity size={200} />
        </div>
        
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-4">
            <p className="text-slate-400 text-sm font-black uppercase tracking-[0.2em]">AI 推定総重量</p>
            <div className="flex flex-col items-end gap-2">
              <span className="bg-slate-800 text-blue-400 text-xs px-4 py-1.5 rounded-full border border-slate-700 font-black tracking-widest">
                SAMPLES x{result.ensembleCount}
              </span>
              {errorRate !== null && (
                <span className={`text-xs px-3 py-1 rounded-full font-black shadow-lg ${Math.abs(errorRate) < 5 ? 'bg-green-500' : 'bg-red-500'}`}>
                  誤差: {errorRate > 0 ? '+' : ''}{errorRate.toFixed(1)}%
                </span>
              )}
            </div>
          </div>

          <div className="flex items-baseline gap-4">
            <span className="text-8xl md:text-9xl font-black text-yellow-500 tracking-tighter drop-shadow-2xl">
              {result.estimatedTonnage.toFixed(1)}
            </span>
            <span className="text-3xl font-black text-slate-400 uppercase tracking-widest">Ton</span>
          </div>

          <div className="grid grid-cols-2 gap-6 mt-12 pt-10 border-t border-slate-800">
            <div className="flex items-center gap-4">
              <div className="bg-slate-800 p-4 rounded-2xl">
                <Truck className="text-blue-400" size={32} />
              </div>
              <div>
                <p className="text-slate-500 text-xs uppercase font-black tracking-widest mb-1">Vehicle Type</p>
                <p className="font-black text-xl leading-none">{result.truckType}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="bg-slate-800 p-4 rounded-2xl">
                <Layers className="text-green-400" size={32} />
              </div>
              <div>
                <p className="text-slate-500 text-xs uppercase font-black tracking-widest mb-1">Volume</p>
                <p className="font-black text-xl leading-none">{result.estimatedVolumeM3.toFixed(1)} m³</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 実測値入力セクション */}
      <div className="sticky top-4 z-30 transition-all duration-500">
        <div className={`p-8 rounded-[2.5rem] border-4 transition-all shadow-2xl ${isSaved ? 'bg-slate-900 border-green-500/50' : 'bg-blue-600 border-white animate-in zoom-in-95'}`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className={`text-sm font-black flex items-center gap-3 uppercase tracking-[0.2em] ${isSaved ? 'text-green-400' : 'text-white'}`}>
              <Scale size={24} />
              {isSaved ? '学習済みデータ' : '実測重量を入力 (AI学習用)'}
            </h3>
            {isSaved && <CheckCircle2 className="text-green-500" size={28} />}
          </div>
          
          <div className="flex gap-4">
            <div className="relative flex-grow">
              <input 
                type="number" 
                inputMode="decimal"
                step="0.01" 
                value={inputValue}
                onChange={(e) => { setInputValue(e.target.value); setIsSaved(false); }}
                placeholder="0.0"
                className={`w-full h-20 px-8 rounded-3xl border-none outline-none font-black text-4xl transition-all ${
                  isSaved ? 'bg-slate-800 text-green-400' : 'bg-white text-slate-900 shadow-inner'
                }`}
              />
              <span className={`absolute right-8 top-1/2 -translate-y-1/2 font-black text-xl ${isSaved ? 'text-green-700' : 'text-slate-300'}`}>
                TON
              </span>
            </div>
            <button 
              onClick={handleSave}
              disabled={isSaved || !inputValue}
              className={`min-w-[120px] h-20 rounded-3xl flex flex-col items-center justify-center gap-1 transition-all active:scale-95 ${
                isSaved 
                  ? "bg-green-500 text-white" 
                  : "bg-slate-900 text-white shadow-2xl hover:bg-black"
              }`}
            >
              {isSaved ? <Check size={32} strokeWidth={4} /> : <Save size={28} />}
              <span className="text-[10px] font-black uppercase tracking-widest">
                {isSaved ? "Saved" : "Save"}
              </span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* 画像と車両情報 */}
        <div className="bg-white rounded-[2.5rem] overflow-hidden shadow-xl border border-slate-200">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
            <span className="font-black text-slate-700 flex items-center gap-3 text-lg uppercase tracking-widest">
              <CreditCard className="text-blue-600" size={24} />
              Vehicle Tag
            </span>
            <div>
              {isEditingPlate ? (
                <div className="flex items-center gap-2 bg-blue-50 p-2 rounded-xl border border-blue-200">
                  <input 
                    type="text" 
                    value={tempNumber} 
                    onChange={(e) => setTempNumber(e.target.value)}
                    className="text-lg font-black border border-blue-300 rounded px-4 py-2 w-32 outline-none uppercase"
                    autoFocus
                  />
                  <button onClick={handlePlateSave} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-black">OK</button>
                </div>
              ) : (
                <button 
                  onClick={() => setIsEditingPlate(true)}
                  className="flex flex-col items-end group"
                >
                  <div className="bg-slate-900 text-white px-5 py-2 rounded-xl flex items-center gap-3 shadow-lg group-hover:bg-black transition-colors">
                    <span className="text-xl font-black tracking-widest">{result.licenseNumber || '----'}</span>
                    <Edit2 size={14} className="text-blue-400" />
                  </div>
                  <span className="text-xs text-slate-400 font-bold mt-1 px-1">{result.licensePlate || '未設定'}</span>
                </button>
              )}
            </div>
          </div>
          <div className="p-2 grid grid-cols-1 gap-2">
            {imageUrls.map((url, i) => (
              <img key={i} src={url} className="w-full h-auto aspect-video object-cover rounded-2xl shadow-inner" />
            ))}
          </div>
        </div>

        {/* 推論の根拠と材質 */}
        <div className="space-y-8">
          <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-200">
            <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-3 uppercase tracking-widest">
              <Info className="text-blue-500" size={24} />
              AI Reasoning
            </h3>
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 mb-8">
              <p className="text-slate-600 font-medium text-lg italic leading-relaxed">"{result.reasoning}"</p>
            </div>
            
            <div className="w-full">
              <p className="text-xs font-black text-slate-400 mb-6 uppercase tracking-[0.3em]">Material Composition</p>
              <div className="space-y-4">
                {result.materialBreakdown.map((item, index) => (
                  <div key={index}>
                    <div className="flex justify-between text-sm font-black text-slate-700 mb-2 uppercase">
                      <span>{item.material}</span>
                      <span>{item.percentage}%</span>
                    </div>
                    <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full transition-all duration-1000" 
                        style={{ width: `${item.percentage}%`, backgroundColor: COLORS[index % COLORS.length] }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalysisResult;
