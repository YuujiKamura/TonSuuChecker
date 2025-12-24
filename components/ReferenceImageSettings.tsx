import React, { useState, useEffect, useRef } from 'react';
import { X, Truck, Plus, Trash2, Camera, FileText, Loader2, Pencil } from 'lucide-react';
import { getReferenceImages, addVehicle, updateVehicle, deleteVehicle, RegisteredVehicle } from '../services/referenceImages';
import { analyzeShaken } from '../services/shakenAnalyzer';
import { convertPdfToImage, isPdf } from '../services/pdfConverter';

interface ReferenceImageSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

const ReferenceImageSettings: React.FC<ReferenceImageSettingsProps> = ({ isOpen, onClose }) => {
  const [vehicles, setVehicles] = useState<RegisteredVehicle[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newCapacity, setNewCapacity] = useState('');
  const [newImage, setNewImage] = useState<string | null>(null);
  const [newImageMime, setNewImageMime] = useState<string>('image/jpeg');
  const [analyzing, setAnalyzing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const shakenInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setVehicles(getReferenceImages());
      resetForm();
    }
  }, [isOpen]);

  const resetForm = () => {
    setShowAddForm(false);
    setEditingId(null);
    setNewName('');
    setNewCapacity('');
    setNewImage(null);
    setNewImageMime('image/jpeg');
    setAnalyzing(false);
  };

  const startEdit = async (vehicle: RegisteredVehicle) => {
    setEditingId(vehicle.id);
    setNewName(vehicle.name);
    setNewCapacity(vehicle.maxCapacity.toString());
    setNewImage(vehicle.base64);
    setNewImageMime(vehicle.mimeType || 'image/jpeg');
    setShowAddForm(true);

    // PDFなら画像に変換
    if (vehicle.mimeType === 'application/pdf') {
      setAnalyzing(true);
      try {
        const imageBase64 = await convertPdfToImage(vehicle.base64);
        setNewImage(imageBase64);
        setNewImageMime('image/jpeg');
      } catch (err) {
        console.error('PDF変換エラー:', err);
      } finally {
        setAnalyzing(false);
      }
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const mimeType = file.type || 'image/jpeg';

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = (reader.result as string).split(',')[1];

      // PDFの場合は画像に変換
      if (isPdf(mimeType)) {
        setAnalyzing(true);
        try {
          const imageBase64 = await convertPdfToImage(base64);
          setNewImage(imageBase64);
          setNewImageMime('image/jpeg');
        } catch (err) {
          console.error('PDF変換エラー:', err);
          // 変換失敗時はそのまま保存
          setNewImage(base64);
          setNewImageMime(mimeType);
        } finally {
          setAnalyzing(false);
        }
      } else {
        setNewImage(base64);
        setNewImageMime(mimeType);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleShakenAnalyze = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const mimeType = file.type || 'application/pdf';

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = (reader.result as string).split(',')[1];
      setAnalyzing(true);

      try {
        const result = await analyzeShaken(base64, mimeType);
        if (result) {
          setNewName(result.vehicleName || '');
          setNewCapacity(result.maxCapacity?.toString() || '');
        }
      } catch (err) {
        console.error('車検証解析エラー:', err);
      } finally {
        setAnalyzing(false);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSave = () => {
    if (!newName.trim() || !newCapacity || !newImage) return;

    if (editingId) {
      // 更新
      updateVehicle(editingId, {
        name: newName.trim(),
        maxCapacity: parseFloat(newCapacity),
        base64: newImage,
        mimeType: newImageMime
      });
    } else {
      // 新規追加
      addVehicle({
        name: newName.trim(),
        maxCapacity: parseFloat(newCapacity),
        base64: newImage,
        mimeType: newImageMime
      });
    }
    setVehicles(getReferenceImages());
    resetForm();
  };

  const handleDelete = (id: string) => {
    deleteVehicle(id);
    setVehicles(getReferenceImages());
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 max-w-lg w-full shadow-2xl my-8 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-black text-white flex items-center gap-3">
            <Truck className="text-blue-500" size={24} />
            車両登録
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white">
            <X size={24} />
          </button>
        </div>

        <p className="text-sm text-slate-400 mb-4">
          車両を登録すると、解析時にAIが比較参照して車両タイプを判定します
        </p>

        {/* 登録済み車両一覧 */}
        <div className="space-y-3 mb-4">
          {vehicles.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              登録車両がありません
            </div>
          ) : (
            vehicles.map((vehicle) => (
              <div key={vehicle.id} className="bg-slate-800 rounded-xl p-3 border border-slate-700 flex gap-3">
                {vehicle.mimeType === 'application/pdf' ? (
                  <div
                    onClick={() => startEdit(vehicle)}
                    className="w-40 h-32 bg-slate-700 rounded-lg flex items-center justify-center shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                  >
                    <FileText size={40} className="text-slate-400" />
                  </div>
                ) : (
                  <img
                    src={`data:${vehicle.mimeType || 'image/jpeg'};base64,${vehicle.base64}`}
                    alt={vehicle.name}
                    onClick={() => startEdit(vehicle)}
                    className="w-40 h-32 object-contain bg-slate-700 rounded-lg shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white truncate">{vehicle.name}</p>
                  <p className="text-sm text-blue-400">最大積載: {vehicle.maxCapacity}t</p>
                </div>
                <button
                  onClick={() => handleDelete(vehicle.id)}
                  className="text-red-400 hover:text-red-300 p-2 self-center"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* 追加フォーム */}
        {showAddForm ? (
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 space-y-4">
            {/* 車検証から読み取りボタン */}
            <button
              onClick={() => shakenInputRef.current?.click()}
              disabled={analyzing}
              className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 disabled:bg-slate-700 text-white font-bold py-3 rounded-lg transition-all"
            >
              {analyzing ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  車検証を解析中...
                </>
              ) : (
                <>
                  <FileText size={20} />
                  車検証から読み取り
                </>
              )}
            </button>
            <input
              type="file"
              ref={shakenInputRef}
              onChange={handleShakenAnalyze}
              accept="image/*,application/pdf"
              className="hidden"
            />

            <div className="border-t border-slate-600 pt-4">
              <div className="mb-4">
                <label className="block text-sm text-slate-400 mb-1">車両名</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="例: 自社4tダンプ、○○建設10t"
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">最大積載量（トン）</label>
                <input
                  type="number"
                  step="0.1"
                  value={newCapacity}
                  onChange={(e) => setNewCapacity(e.target.value)}
                  placeholder="例: 3.5"
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-slate-400 mb-1">車両写真</label>
              {newImage ? (
                <div className="relative">
                  {newImageMime === 'application/pdf' ? (
                    <div className="w-full h-32 bg-slate-700 rounded-lg flex items-center justify-center">
                      <FileText size={40} className="text-slate-400" />
                      <span className="ml-2 text-slate-400">PDF</span>
                    </div>
                  ) : (
                    <img
                      src={`data:${newImageMime};base64,${newImage}`}
                      alt="Preview"
                      className="w-full h-32 object-cover rounded-lg"
                    />
                  )}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 flex items-center justify-center text-white font-bold rounded-lg transition-opacity"
                  >
                    変更
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-24 border-2 border-dashed border-slate-600 rounded-lg flex items-center justify-center gap-2 text-slate-400 hover:border-blue-500 hover:text-blue-400 transition-colors"
                >
                  <Camera size={20} />
                  写真を選択
                </button>
              )}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept="image/*,application/pdf"
                className="hidden"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={!newName.trim() || !newCapacity || !newImage}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-2 rounded-lg transition-all"
              >
                {editingId ? '更新' : '登録'}
              </button>
              <button
                onClick={resetForm}
                className="px-4 bg-slate-700 hover:bg-slate-600 text-slate-300 font-bold py-2 rounded-lg transition-all"
              >
                キャンセル
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-all"
          >
            <Plus size={20} />
            車両を追加
          </button>
        )}

        <div className="mt-4 pt-4 border-t border-slate-700">
          <p className="text-xs text-slate-500">
            後方から撮影した画像がおすすめです。ナンバープレートと荷台が見える角度で登録してください。
          </p>
        </div>
      </div>
    </div>
  );
};

export default ReferenceImageSettings;
