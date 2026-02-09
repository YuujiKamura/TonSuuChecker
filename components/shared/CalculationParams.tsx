import React from 'react';
import { PartialCalcParams } from '../../types/ui';

interface CalculationParamsProps {
  params: PartialCalcParams;
  compact?: boolean;  // trueの場合は進捗UI用のコンパクト表示
}

interface ParamDef {
  key: keyof PartialCalcParams;
  label: string;
  shortLabel: string;
  unit: string;
  decimals: number;
}

const PARAM_DEFS: ParamDef[] = [
  { key: 'heightM', label: '荷高 (H)', shortLabel: 'H', unit: 'm', decimals: 3 },
  { key: 'fillRatioL', label: '長さ充填率 (L)', shortLabel: 'L', unit: '', decimals: 3 },
  { key: 'fillRatioW', label: '幅充填率 (W)', shortLabel: 'W', unit: '', decimals: 3 },
  { key: 'taperRatio', label: '斜面係数 (T)', shortLabel: 'T', unit: '', decimals: 3 },
  { key: 'packingDensity', label: '充填密度 (P)', shortLabel: 'P', unit: '', decimals: 3 },
  { key: 'density', label: '材料密度', shortLabel: 'ρ', unit: 't/m³', decimals: 2 },
];

const CalculationParams: React.FC<CalculationParamsProps> = ({ params, compact }) => {
  if (compact) {
    // 進捗UI用: 1行に並べるコンパクト表示
    const filled = PARAM_DEFS.map(def => ({
      ...def,
      value: params[def.key],
    })).filter(r => r.value != null);

    const hasResult = params.estimatedTonnage != null;

    return (
      <div className="bg-slate-950/50 rounded-lg p-2 font-mono text-xs">
        {filled.length === 0 && !hasResult ? (
          <div className="text-slate-600 text-center">パラメータ取得中...</div>
        ) : (
          <>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
              {filled.map((p, i) => (
                <span key={i} className="animate-in fade-in duration-300">
                  <span className="text-slate-500">{p.shortLabel}=</span>
                  <span className="text-white">{p.value!.toFixed(p.decimals)}</span>
                  {p.unit && <span className="text-slate-600 ml-0.5">{p.unit}</span>}
                </span>
              ))}
            </div>
            {hasResult && (
              <div className="flex items-center gap-3 mt-1 pt-1 border-t border-slate-800">
                <span>
                  <span className="text-slate-500">V=</span>
                  <span className="text-cyan-400">{params.estimatedVolumeM3!.toFixed(4)}</span>
                  <span className="text-slate-600 ml-0.5">m³</span>
                </span>
                <span className="font-bold">
                  <span className="text-slate-500">W=</span>
                  <span className="text-yellow-400">{params.estimatedTonnage!.toFixed(2)}</span>
                  <span className="text-slate-600 ml-0.5">t</span>
                </span>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // 結果表示用: 詳細レイアウト
  return (
    <div className="bg-slate-950/50 rounded-lg p-2 font-mono text-xs space-y-0.5">
      {PARAM_DEFS.map((def) => {
        const value = params[def.key];
        return (
          <div key={def.key} className="flex items-center justify-between">
            <span className="text-slate-400">{def.label}</span>
            <span className="text-white">
              {value != null ? value.toFixed(def.decimals) : '-'}
              {def.unit && <span className="text-slate-500 ml-1">{def.unit}</span>}
            </span>
          </div>
        );
      })}
      <div className="flex items-center justify-between pt-1 border-t border-slate-800">
        <span className="text-slate-400">体積</span>
        <span className="text-cyan-400">
          {params.estimatedVolumeM3 != null ? params.estimatedVolumeM3.toFixed(4) : '-'}
          <span className="text-slate-500 ml-1">m³</span>
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-slate-400 font-bold">推定重量</span>
        <span className="text-yellow-400 font-bold">
          {params.estimatedTonnage != null ? params.estimatedTonnage.toFixed(2) : '-'}
          <span className="text-slate-500 ml-1">t</span>
        </span>
      </div>
    </div>
  );
};

export default CalculationParams;
