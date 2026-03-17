import React, { useState, useEffect } from 'react';
import { X, Check, RotateCcw, Copy, Save } from 'lucide-react';
import {
  PROMPT_TEMPLATES,
  DEFAULT_PROMPTS,
  getSelectedTemplateId,
  setSelectedTemplateId,
  getTemplatePrompt,
  saveTemplatePrompt,
  resetTemplatePrompt,
} from '../promptTemplates';

interface PromptEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onTemplateChange: (id: string) => void;
}

const PromptEditor: React.FC<PromptEditorProps> = ({ isOpen, onClose, onTemplateChange }) => {
  const [selectedId, setSelectedId] = useState(getSelectedTemplateId());
  const [editingVolume, setEditingVolume] = useState('');
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const id = getSelectedTemplateId();
      setSelectedId(id);
      setEditingVolume(getTemplatePrompt(id));
    }
  }, [isOpen]);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setSelectedTemplateId(id);
    onTemplateChange(id);
    setEditingVolume(getTemplatePrompt(id));
  };

  const handleSave = () => {
    saveTemplatePrompt(selectedId, editingVolume);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    const defaultPrompt = DEFAULT_PROMPTS[selectedId as keyof typeof DEFAULT_PROMPTS];
    if (defaultPrompt) {
      setEditingVolume(defaultPrompt.volumePrompt);
      resetTemplatePrompt(selectedId);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(editingVolume);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  const defaultPrompt = DEFAULT_PROMPTS[selectedId as keyof typeof DEFAULT_PROMPTS];
  const hasChanges = defaultPrompt && editingVolume !== defaultPrompt.volumePrompt;
  const savedPrompt = getTemplatePrompt(selectedId);
  const isUnsaved = editingVolume !== savedPrompt;

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[130] flex flex-col">
      {/* ヘッダー */}
      <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900">
        <h2 className="text-lg font-black text-white">AIプロンプト編集</h2>
        <button
          onClick={onClose}
          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all"
        >
          <X size={20} />
        </button>
      </div>

      {/* テンプレート選択タブ */}
      <div className="flex border-b border-slate-800 bg-slate-900/50">
        {PROMPT_TEMPLATES.map(template => (
          <button
            key={template.id}
            onClick={() => handleSelect(template.id)}
            className={`flex-1 py-3 px-4 text-sm font-bold transition-all border-b-2 ${
              selectedId === template.id
                ? 'text-purple-400 border-purple-500 bg-purple-500/10'
                : 'text-slate-400 border-transparent hover:text-white hover:bg-slate-800'
            }`}
          >
            <div>{template.name}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">{template.description}</div>
          </button>
        ))}
      </div>

      {/* メインエディタ */}
      <div className="flex-1 overflow-hidden flex flex-col p-4 gap-4">
        {/* ツールバー */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            disabled={!hasChanges}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              hasChanges
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white'
                : 'bg-slate-800/50 text-slate-600 cursor-not-allowed'
            }`}
          >
            <RotateCcw size={14} />
            デフォルトに戻す
          </button>
          <button
            onClick={handleCopy}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              copied
                ? 'bg-green-500/20 text-green-400'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white'
            }`}
          >
            <Copy size={14} />
            {copied ? 'コピー完了' : 'コピー'}
          </button>
          <div className="flex-1" />
          {isUnsaved && (
            <span className="text-xs text-amber-400">未保存</span>
          )}
          {hasChanges && !isUnsaved && (
            <span className="text-xs text-blue-400">編集済み</span>
          )}
          <button
            onClick={handleSave}
            disabled={!isUnsaved}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${
              saved
                ? 'bg-green-500 text-white'
                : isUnsaved
                ? 'bg-purple-500 hover:bg-purple-400 text-white'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
          >
            {saved ? <Check size={16} /> : <Save size={16} />}
            {saved ? '保存完了' : '保存'}
          </button>
        </div>

        {/* エディタ本体 */}
        <div className="flex-1 overflow-hidden">
          <textarea
            value={editingVolume}
            onChange={(e) => setEditingVolume(e.target.value)}
            className="w-full h-full bg-slate-950 border border-slate-700 rounded-xl p-4 text-sm text-slate-200 font-mono resize-none focus:outline-none focus:border-purple-500 leading-relaxed"
            placeholder="プロンプトを入力..."
            spellCheck={false}
          />
        </div>

        {/* 空隙率の違い説明 */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-3 text-xs">
          <div className="font-bold text-slate-300 mb-2">空隙率の違い</div>
          <div className="grid grid-cols-2 gap-4 text-slate-400">
            <div>
              <span className="text-purple-400 font-bold">シンプル:</span>
              <div>塊サイズのみ 0.30〜0.40</div>
            </div>
            <div>
              <span className="text-amber-400 font-bold">2段階:</span>
              <div>塊 + 積み方補正 0.30〜0.65</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PromptEditor;
