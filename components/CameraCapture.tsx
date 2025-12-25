import React, { useRef, useEffect, useState } from 'react';
import { Camera, X, RotateCcw } from 'lucide-react';

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

      {/* シャッターボタン */}
      <div className="absolute bottom-0 left-0 right-0 p-8 flex justify-center bg-gradient-to-t from-black/80 to-transparent">
        <button
          onClick={capturePhoto}
          disabled={!isReady || isAnalyzing}
          className={"w-20 h-20 rounded-full border-4 border-white flex items-center justify-center transition-all " + (isAnalyzing ? "opacity-50" : "hover:scale-105 active:scale-95")}
        >
          <div className={"w-16 h-16 rounded-full " + (isAnalyzing ? "bg-gray-500 animate-pulse" : "bg-white")} />
        </button>
      </div>

      {isAnalyzing && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
          <div className="bg-slate-900 px-8 py-4 rounded-2xl border border-blue-500">
            <span className="text-white font-bold animate-pulse">解析中...</span>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default CameraCapture;
