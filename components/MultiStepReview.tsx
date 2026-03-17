import React, { useState } from 'react';
import { Check, X, MessageSquare, Loader2, RotateCcw } from 'lucide-react';

export interface StepResult {
  stepNumber: number;
  name: string;
  value: number;
  unit: string;
  reasoning: string;
  status: 'pending' | 'running' | 'awaiting_approval' | 'approved' | 'retrying';
}

interface MultiStepReviewProps {
  imageUrl: string;
  steps: StepResult[];
  currentStep: number;
  finalResult?: {
    volume: number;
    tonnage: number;
  };
  onApprove: (stepNumber: number) => void;
  onReject: (stepNumber: number, feedback: string) => void;
  onCancel: () => void;
  onComplete: () => void;
}

const MultiStepReview: React.FC<MultiStepReviewProps> = ({
  imageUrl,
  steps,
  currentStep,
  finalResult,
  onApprove,
  onReject,
  onCancel,
  onComplete,
}) => {
  const [rejectingStep, setRejectingStep] = useState<number | null>(null);
  const [feedbackText, setFeedbackText] = useState<string>('');

  const handleStartReject = (stepNumber: number) => {
    setRejectingStep(stepNumber);
    setFeedbackText('');
  };

  const handleSubmitFeedback = (stepNumber: number) => {
    if (feedbackText.trim()) {
      onReject(stepNumber, feedbackText.trim());
    }
    setRejectingStep(null);
    setFeedbackText('');
  };

  const allStepsApproved = steps.every(s => s.status === 'approved');

  return (
    <div className="fixed inset-0 bg-black/95 backdrop-blur-sm z-[120] flex flex-col">
      {/* ヘッダー */}
      <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900">
        <h2 className="text-lg font-black text-white">ステップ確認</h2>
        <button
          onClick={onCancel}
          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all"
        >
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-2xl mx-auto space-y-4">
          {/* 画像プレビュー（小さく） */}
          <div className="aspect-video max-h-40 rounded-2xl overflow-hidden bg-slate-900 border border-slate-700">
            <img src={imageUrl} className="w-full h-full object-cover" alt="対象画像" />
          </div>

          {/* ステップリスト */}
          <div className="space-y-3">
            {steps.map((step, idx) => (
              <div
                key={step.stepNumber}
                className={`rounded-2xl border p-4 transition-all ${
                  step.status === 'running'
                    ? 'bg-blue-950/50 border-blue-500 animate-pulse'
                    : step.status === 'awaiting_approval'
                    ? 'bg-amber-950/50 border-amber-500'
                    : step.status === 'approved'
                    ? 'bg-green-950/30 border-green-600'
                    : 'bg-slate-900/50 border-slate-700'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* ステップ番号 */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    step.status === 'approved'
                      ? 'bg-green-600 text-white'
                      : step.status === 'running' || step.status === 'retrying'
                      ? 'bg-blue-600 text-white'
                      : step.status === 'awaiting_approval'
                      ? 'bg-amber-600 text-white'
                      : 'bg-slate-700 text-slate-400'
                  }`}>
                    {step.status === 'approved' ? (
                      <Check size={16} />
                    ) : step.status === 'running' || step.status === 'retrying' ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      step.stepNumber
                    )}
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white">{step.name}</span>
                      {step.status === 'approved' && (
                        <span className="text-xs text-green-400 font-bold">承認済み</span>
                      )}
                    </div>

                    {/* 値表示 */}
                    {(step.status !== 'pending' && step.status !== 'running' && step.status !== 'retrying') && (
                      <div className="mt-2">
                        <div className="flex items-baseline gap-2">
                          <span className="text-3xl font-black text-white tabular-nums">
                            {step.value.toFixed(2)}
                          </span>
                          <span className="text-slate-400">{step.unit}</span>
                        </div>

                        {/* 根拠 */}
                        {step.reasoning && (
                          <p className="mt-2 text-xs text-slate-400 leading-relaxed bg-slate-800/50 p-2 rounded-lg">
                            {step.reasoning}
                          </p>
                        )}

                        {/* 承認/指摘ボタン */}
                        {step.status === 'awaiting_approval' && rejectingStep !== step.stepNumber && (
                          <div className="flex items-center gap-2 mt-3">
                            <button
                              onClick={() => onApprove(step.stepNumber)}
                              className="flex items-center gap-1 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-bold transition-all"
                            >
                              <Check size={16} />
                              承認
                            </button>
                            <button
                              onClick={() => handleStartReject(step.stepNumber)}
                              className="flex items-center gap-1 px-4 py-2 rounded-lg bg-red-600/80 hover:bg-red-500 text-white text-sm font-bold transition-all"
                            >
                              <MessageSquare size={16} />
                              指摘
                            </button>
                          </div>
                        )}

                        {/* 指摘入力欄 */}
                        {rejectingStep === step.stepNumber && (
                          <div className="mt-3 space-y-2">
                            <textarea
                              value={feedbackText}
                              onChange={(e) => setFeedbackText(e.target.value)}
                              placeholder="例: 高すぎる、後板の2倍程度に見える"
                              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-red-500/50 text-white text-sm focus:outline-none focus:border-red-500 resize-none"
                              rows={2}
                              autoFocus
                            />
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleSubmitFeedback(step.stepNumber)}
                                disabled={!feedbackText.trim()}
                                className="flex items-center gap-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <RotateCcw size={14} />
                                再推論
                              </button>
                              <button
                                onClick={() => setRejectingStep(null)}
                                className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm transition-all"
                              >
                                取消
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {step.status === 'running' && (
                      <p className="mt-2 text-sm text-blue-400">推論中...</p>
                    )}
                    {step.status === 'retrying' && (
                      <p className="mt-2 text-sm text-amber-400">指摘を考慮して再推論中...</p>
                    )}
                    {step.status === 'pending' && (
                      <p className="mt-2 text-sm text-slate-500">待機中</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 最終計算結果 */}
          {allStepsApproved && finalResult && (
            <div className="mt-6 p-6 rounded-3xl bg-gradient-to-br from-emerald-950/80 to-slate-900 border border-emerald-500">
              <h3 className="text-sm font-bold text-emerald-400 mb-3">計算結果</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-xs text-slate-400">体積</span>
                  <div className="text-2xl font-black text-white tabular-nums">
                    {finalResult.volume.toFixed(2)} <span className="text-sm text-slate-400">m³</span>
                  </div>
                </div>
                <div>
                  <span className="text-xs text-slate-400">推定重量</span>
                  <div className="text-3xl font-black text-emerald-400 tabular-nums">
                    {finalResult.tonnage.toFixed(2)} <span className="text-lg text-emerald-600">t</span>
                  </div>
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-500 font-mono">
                体積 = (2/3)×π×1.7×1.0×{steps[0]?.value.toFixed(2)} = {finalResult.volume.toFixed(2)}m³
                <br />
                重量 = {finalResult.volume.toFixed(2)}×2.5×(1-{steps[1]?.value.toFixed(2)}) = {finalResult.tonnage.toFixed(2)}t
              </p>
              <button
                onClick={onComplete}
                className="mt-4 w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-lg transition-all"
              >
                この結果を採用
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MultiStepReview;
