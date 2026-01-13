import React, { useRef, useEffect, useState } from 'react';
import { Camera, X, RotateCcw, Smartphone } from 'lucide-react';

interface CameraCaptureProps {
  onCapture: (base64: string, url: string) => void;
  onClose: () => void;
  isAnalyzing: boolean;
}

const CameraCapture: React.FC<CameraCaptureProps> = ({ onCapture, onClose, isAnalyzing }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isPortrait, setIsPortrait] = useState(window.innerHeight > window.innerWidth);

  // 画面の向きを監視
  useEffect(() => {
    const handleResize = () => {
      setIsPortrait(window.innerHeight > window.innerWidth);
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [facingMode]);

  const startCamera = async () => {
    try {
      // 既存のストリームを停止
      stopCamera();
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1280 },
          height: { ideal: 960 },
          aspectRatio: { ideal: 4/3 }  // 横長（ランドスケープ）を優先
        },
        audio: false
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsReady(true);
      }
    } catch (err) {
      console.error('Camera access failed', err);
      setIsReady(false);
    }
  };

  const stopCamera = () => {
    const stream = videoRef.current?.srcObject as MediaStream;
    stream?.getTracks().forEach(track => track.stop());
  };

  const switchCamera = () => {
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current || isAnalyzing) return;
    
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
    
    const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
    const url = canvas.toDataURL('image/jpeg', 0.8);
    
    onCapture(base64, url);
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* ヘッダー */}
      <div className="absolute top-0 left-0 right-0 z-10 p-4 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent">
        <button 
          onClick={onClose}
          className="p-3 bg-white/10 backdrop-blur-md rounded-full text-white hover:bg-white/20 transition-all"
        >
          <X size={24} />
        </button>
        <span className="text-white font-bold text-sm uppercase tracking-widest">カメラ</span>
        <button 
          onClick={switchCamera}
          className="p-3 bg-white/10 backdrop-blur-md rounded-full text-white hover:bg-white/20 transition-all"
        >
          <RotateCcw size={24} />
        </button>
      </div>

      {/* カメラビュー */}
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        muted 
        className="w-full h-full object-cover"
      />
      
      {/* ターゲット枠 */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[85%] h-[60%] border-2 border-white/30 rounded-3xl">
          <div className="absolute top-4 left-4 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-xl" />
          <div className="absolute top-4 right-4 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-xl" />
          <div className="absolute bottom-4 left-4 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-xl" />
          <div className="absolute bottom-4 right-4 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-xl" />
        </div>
      </div>

      {/* シャッターボタン / 解析中表示 */}
      <div className="absolute bottom-0 left-0 right-0 p-8 flex flex-col items-center gap-4 bg-gradient-to-t from-black/90 to-transparent">
        {isAnalyzing ? (
          <div className="bg-slate-900 px-8 py-4 rounded-2xl border border-blue-500">
            <span className="text-white font-bold animate-pulse">解析中...</span>
          </div>
        ) : (
          <button
            onClick={capturePhoto}
            disabled={!isReady}
            className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center transition-all hover:scale-105 active:scale-95"
          >
            <div className="w-16 h-16 rounded-full bg-white" />
          </button>
        )}
      </div>

      {/* 横向きガイド（縦向きの場合に表示） */}
      {isPortrait && !isAnalyzing && (
        <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-20 pointer-events-none">
          <div className="flex flex-col items-center gap-4 p-6 rounded-2xl">
            <div className="relative">
              <Smartphone size={64} className="text-white animate-pulse" style={{ transform: 'rotate(-90deg)' }} />
              <div className="absolute -right-2 top-1/2 -translate-y-1/2">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-yellow-400 animate-bounce">
                  <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>
            <p className="text-white text-lg font-bold text-center">
              スマホを横向きにしてください
            </p>
            <p className="text-slate-400 text-sm text-center">
              横長の写真が撮影できます
            </p>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default CameraCapture;
