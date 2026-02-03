
import React, { useRef, useEffect, useState } from 'react';
import { Camera, Activity, Play, Square, Scan, Search, AlertTriangle, Target, Crosshair, ZapOff, Wind } from 'lucide-react';

interface MonitorViewProps {
  onDetected: (base64: string, url: string) => void;
  isAnalyzing: boolean;
  isLocked: boolean;
  guidance?: string | null;
  isRateLimited: boolean; // クォータ制限中かどうか
}

const MonitorView: React.FC<MonitorViewProps> = ({ onDetected, isAnalyzing, isLocked, guidance, isRateLimited }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prevFrameRef = useRef<ImageData | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [motionLevel, setMotionLevel] = useState(0);
  const [flash, setFlash] = useState(false);
  
  const lastCaptureTime = useRef<number>(0);
  const SCAN_INTERVAL = isRateLimited ? 15000 : 6000; // 制限中は15秒、通常は6秒
  const MOTION_THRESHOLD = 0.05; // 5%以上の変化で動体とみなす

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsActive(true);
      }
    } catch (err) {
      console.error("Camera access failed", err);
      setIsActive(false);
    }
  };

  const stopCamera = () => {
    const stream = videoRef.current?.srcObject as MediaStream;
    stream?.getTracks().forEach(track => track.stop());
    setIsActive(false);
  };

  // 動体検知ロジック
  const detectMotion = () => {
    if (!videoRef.current || !canvasRef.current || !isActive || isAnalyzing || isLocked) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    // 低解像度で比較（高速化）
    const checkW = 64;
    const checkH = 48;
    canvas.width = checkW;
    canvas.height = checkH;
    ctx.drawImage(video, 0, 0, checkW, checkH);
    const currentFrame = ctx.getImageData(0, 0, checkW, checkH);

    if (prevFrameRef.current) {
      let diff = 0;
      const data1 = prevFrameRef.current.data;
      const data2 = currentFrame.data;
      for (let i = 0; i < data1.length; i += 4) {
        // 輝度差分を計算
        const brightness1 = (data1[i] + data1[i+1] + data1[i+2]) / 3;
        const brightness2 = (data2[i] + data2[i+1] + data2[i+2]) / 3;
        if (Math.abs(brightness1 - brightness2) > 30) {
          diff++;
        }
      }
      const score = diff / (checkW * checkH);
      setMotionLevel(score);

      const now = Date.now();
      // 動きがあり、かつインターバルを超えている場合のみ解析へ
      if (score > MOTION_THRESHOLD && now - lastCaptureTime.current >= SCAN_INTERVAL) {
        captureAndAnalyze();
        lastCaptureTime.current = now;
      }
    }
    prevFrameRef.current = currentFrame;
  };

  useEffect(() => {
    let frameId: number;
    const loop = () => {
      detectMotion();
      frameId = requestAnimationFrame(loop);
    };
    if (isActive) frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [isActive, isAnalyzing, isLocked, isRateLimited]);

  const captureAndAnalyze = () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const MAX_WIDTH = 1280; // CALS 100万画素
    let width = video.videoWidth;
    let height = video.videoHeight;
    if (width > MAX_WIDTH) {
      height = Math.round((height * MAX_WIDTH) / width);
      width = MAX_WIDTH;
    }
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, width, height);

    // base64は高品質（バックアップ用）、urlは表示用で軽量化
    const base64 = canvas.toDataURL('image/jpeg', 0.95).split(',')[1];
    const url = canvas.toDataURL('image/jpeg', 0.6);

    setFlash(true);
    setTimeout(() => setFlash(false), 100);
    onDetected(base64, url);
  };

  return (
    <div className="relative w-full h-[calc(100vh-64px)] bg-black flex flex-col overflow-hidden">
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        muted 
        className={`w-full h-full object-cover transition-all duration-700 ${isActive ? 'opacity-100' : 'opacity-20'} ${isLocked ? 'scale-110 blur-[2px]' : ''}`}
      />
      
      {flash && <div className="absolute inset-0 bg-white/40 z-50 pointer-events-none"></div>}
      {isLocked && <div className="absolute inset-0 bg-red-600/20 z-40 animate-pulse pointer-events-none border-[12px] border-red-600/50"></div>}

      {/* モーション・アクティビティ・バー */}
      <div className="absolute bottom-32 left-1/2 -translate-x-1/2 w-48 h-1.5 bg-white/10 rounded-full overflow-hidden backdrop-blur-md border border-white/5 pointer-events-none">
        <div 
          className={`h-full transition-all duration-300 ${motionLevel > MOTION_THRESHOLD ? 'bg-green-500 shadow-[0_0_10px_#22c55e]' : 'bg-white/30'}`}
          style={{ width: `${Math.min(motionLevel * 500, 100)}%` }}
        ></div>
        {motionLevel > MOTION_THRESHOLD && <div className="absolute top-0 right-0 h-full w-1 bg-white animate-ping"></div>}
      </div>

      {!isActive && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80 backdrop-blur-sm z-10">
          <Camera size={64} className="text-slate-600 mb-4 animate-pulse" />
          <button 
            onClick={startCamera}
            className="bg-green-600 text-white px-8 py-4 rounded-full font-bold text-lg shadow-xl active:scale-95 transition-all"
          >
            監視システムを起動
          </button>
        </div>
      )}

      {isActive && (
        <>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className={`w-[85%] h-[65%] border-2 rounded-[3rem] relative transition-all duration-500 ${isLocked ? 'border-red-500 scale-105' : (isRateLimited ? 'border-slate-700' : 'border-white/20')}`}>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                {isLocked ? (
                  <div className="bg-red-600 px-10 py-6 rounded-full flex flex-col items-center gap-2 shadow-2xl scale-125 animate-bounce">
                    <Target className="text-white" size={40} />
                    <span className="text-white font-black text-2xl uppercase tracking-[0.2em]">Target Locked</span>
                  </div>
                ) : isAnalyzing ? (
                  <div className="bg-blue-600 px-8 py-4 rounded-full flex items-center gap-4 shadow-2xl scale-110 animate-pulse">
                    <Search className="text-white" size={24} />
                    <span className="text-white font-black text-xl uppercase tracking-widest">Identifying...</span>
                  </div>
                ) : isRateLimited ? (
                  <div className="bg-slate-800/90 px-8 py-4 rounded-full border border-slate-600 flex items-center gap-4 shadow-2xl">
                    <ZapOff className="text-amber-500" size={24} />
                    <span className="text-slate-400 font-black text-xl uppercase tracking-widest leading-none">Cooling Down...</span>
                  </div>
                ) : (
                  <div className="bg-black/40 backdrop-blur-md px-8 py-4 rounded-full border border-white/20 flex items-center gap-4 shadow-2xl">
                    {motionLevel > MOTION_THRESHOLD ? <Activity className="text-green-500 animate-pulse" size={24} /> : <Wind className="text-slate-500" size={24} />}
                    <span className="text-white font-black text-xl uppercase tracking-widest">
                      {motionLevel > MOTION_THRESHOLD ? 'Motion Detected' : 'Waiting...'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="absolute bottom-12 left-0 right-0 px-8 flex justify-center pointer-events-none">
             <div className={`max-w-md w-full backdrop-blur-2xl border-2 px-8 py-5 rounded-3xl flex items-center gap-5 shadow-2xl transition-all duration-500 transform ${guidance ? 'translate-y-0 opacity-100 bg-amber-950/80 border-amber-500/50' : 'translate-y-10 opacity-0 bg-slate-900/80 border-slate-700/50'}`}>
                <div className="bg-amber-500 text-slate-900 p-3 rounded-full animate-pulse shadow-lg">
                  <AlertTriangle size={24} fill="currentColor" />
                </div>
                <div className="flex-grow">
                  <p className="text-xs font-black text-amber-500 uppercase tracking-widest mb-1 leading-none">Detection Guide</p>
                  <p className="text-white font-black text-lg leading-tight">{guidance || "荷台を中央に捉えてください"}</p>
                </div>
             </div>
          </div>
        </>
      )}

      <div className="absolute top-6 left-6 right-6 flex justify-between items-start pointer-events-none">
        <div className="bg-black/80 backdrop-blur-xl px-5 py-3 rounded-2xl border border-white/10 flex items-center gap-4 shadow-2xl pointer-events-auto">
          <div className={`w-2.5 h-2.5 rounded-full ${isRateLimited ? 'bg-amber-500 animate-ping' : (isActive ? 'bg-green-500 shadow-[0_0_10px_#22c55e]' : 'bg-slate-700')}`}></div>
          <span className="text-[10px] font-black text-white uppercase tracking-widest">
            {isRateLimited ? 'Quota Restricted' : (motionLevel > MOTION_THRESHOLD ? 'Activity Detected' : 'Motion Sentry Active')}
          </span>
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default MonitorView;
