import React, { useState, useEffect } from 'react';
import { FileText, Check, Edit3, Save, RotateCcw, Copy, AlertCircle } from 'lucide-react';
import {
  PROMPT_TEMPLATES,
  getSelectedTemplateId,
  setSelectedTemplateId,
  getCustomPrompt,
  saveCustomPrompt,
  PromptTemplate,
} from '../promptTemplates';

interface PromptSettingsProps {
  embedded?: boolean;
}

const PromptSettings: React.FC<PromptSettingsProps> = ({ embedded = false }) => {
  const [selectedId, setSelectedId] = useState(getSelectedTemplateId());
  const [isEditing, setIsEditing] = useState(false);
  const [editingSystem, setEditingSystem] = useState('');
  const [editingVolume, setEditingVolume] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [copied, setCopied] = useState(false);

  // 選択中のテンプレートを取得
  const getTemplate = (id: string): PromptTemplate => {
    const template = PROMPT_TEMPLATES.find(t => t.id === id);
    if (!template) return PROMPT_TEMPLATES[0];
    if (template.id === 'custom') {
      const custom = getCustomPrompt();
      return { ...template, ...custom };
    }
    return template;
  };

  useEffect(() => {
    const template = getTemplate(selectedId);
    setEditingSystem(template.systemPrompt);
    setEditingVolume(template.volumePrompt);
  }, [selectedId]);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setSelectedTemplateId(id);
    setIsEditing(false);
  };

  const handleSaveCustom = () => {
    saveCustomPrompt(editingSystem, editingVolume);
    setIsEditing(false);
  };

  const handleResetCustom = () => {
    // Rust版をベースにリセット
    const rustTemplate = PROMPT_TEMPLATES.find(t => t.id === 'rust')!;
    setEditingSystem(rustTemplate.systemPrompt);
    setEditingVolume(rustTemplate.volumePrompt);
  };

  const handleCopyToClipboard = () => {
    const template = getTemplate(selectedId);
    const fullPrompt = `=== System Prompt ===\n${template.systemPrompt}\n\n=== Volume Prompt ===\n${template.volumePrompt}`;
    navigator.clipboard.writeText(fullPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const currentTemplate = getTemplate(selectedId);

  return (
    <div className="space-y-4">
      {/* テンプレート選択 */}
      <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700">
        <div className="flex items-center gap-2 mb-3">
          <FileText size={18} className="text-purple-500" />
          <h3 className="text-sm font-bold text-white">プロンプトテンプレート</h3>
        </div>

        <div className="space-y-2">
          {PROMPT_TEMPLATES.map(template => (
            <button
              key={template.id}
              onClick={() => handleSelect(template.id)}
              className={`w-full text-left p-3 rounded-xl border transition-all ${
                selectedId === template.id
                  ? 'bg-purple-500/10 border-purple-500/50'
                  : 'bg-slate-900 border-slate-700 hover:border-slate-600'
              }`}
            >
              <div className="flex items-center gap-2">
                {selectedId === template.id && (
                  <Check size={16} className="text-purple-500 shrink-0" />
                )}
                <span className={`text-sm font-bold ${selectedId === template.id ? 'text-purple-400' : 'text-white'}`}>
                  {template.name}
                </span>
                {template.editable && (
                  <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded">
                    編集可
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1 ml-6">{template.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* 空隙率の違い説明 */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
        <div className="flex items-start gap-2">
          <AlertCircle size={16} className="text-amber-500 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-200">
            <p className="font-bold mb-1">空隙率の違い</p>
            <ul className="space-y-0.5 text-amber-300/80">
              <li>• <span className="font-bold">Rust版</span>: 0.30〜0.40（塊サイズのみ）</li>
              <li>• <span className="font-bold">現行版</span>: 0.30〜0.65（塊サイズ+積み方補正）</li>
            </ul>
          </div>
        </div>
      </div>

      {/* プレビュー/編集 */}
      {selectedId === 'custom' && (
        <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Edit3 size={18} className="text-yellow-500" />
              <h3 className="text-sm font-bold text-white">カスタム編集</h3>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleResetCustom}
                className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-white transition-all"
                title="Rust版にリセット"
              >
                <RotateCcw size={14} />
              </button>
              <button
                onClick={handleSaveCustom}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-500/20 hover:bg-green-500/30 text-green-400 text-xs font-bold transition-all"
              >
                <Save size={14} />
                保存
              </button>
            </div>
          </div>

          {/* システムプロンプト */}
          <div className="mb-4">
            <label className="text-xs font-bold text-slate-400 mb-1 block">
              システムプロンプト
            </label>
            <textarea
              value={editingSystem}
              onChange={(e) => setEditingSystem(e.target.value)}
              className="w-full h-40 bg-slate-900 border border-slate-600 rounded-xl px-3 py-2 text-xs text-white font-mono resize-none focus:outline-none focus:border-purple-500"
              placeholder="システムプロンプトを入力..."
            />
          </div>

          {/* 体積計算プロンプト */}
          <div>
            <label className="text-xs font-bold text-slate-400 mb-1 block">
              体積・空隙率プロンプト
            </label>
            <textarea
              value={editingVolume}
              onChange={(e) => setEditingVolume(e.target.value)}
              className="w-full h-60 bg-slate-900 border border-slate-600 rounded-xl px-3 py-2 text-xs text-white font-mono resize-none focus:outline-none focus:border-purple-500"
              placeholder="体積計算プロンプトを入力..."
            />
          </div>
        </div>
      )}

      {/* プレビュー（カスタム以外） */}
      {selectedId !== 'custom' && (
        <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-white transition-colors"
            >
              <FileText size={16} />
              プロンプトプレビュー
              <span className="text-xs">({showPreview ? '閉じる' : '開く'})</span>
            </button>
            <button
              onClick={handleCopyToClipboard}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                copied
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-white'
              }`}
            >
              <Copy size={14} />
              {copied ? 'コピー完了' : 'コピー'}
            </button>
          </div>

          {showPreview && (
            <div className="space-y-3">
              <div>
                <div className="text-xs font-bold text-purple-400 mb-1">System Prompt</div>
                <pre className="text-[10px] text-slate-400 bg-slate-900 rounded-lg p-2 overflow-x-auto max-h-40 whitespace-pre-wrap">
                  {currentTemplate.systemPrompt}
                </pre>
              </div>
              <div>
                <div className="text-xs font-bold text-blue-400 mb-1">Volume Prompt</div>
                <pre className="text-[10px] text-slate-400 bg-slate-900 rounded-lg p-2 overflow-x-auto max-h-60 whitespace-pre-wrap">
                  {currentTemplate.volumePrompt}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PromptSettings;
