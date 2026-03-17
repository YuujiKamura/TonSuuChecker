// プロンプトテンプレート管理

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  volumePrompt: string;
  editable: boolean;
}

// Rust版プロンプト（シンプル、空隙率0.30〜0.40）
const RUST_SYSTEM_PROMPT = `あなたは建設廃棄物（ガラ）の重量推定を行うシステムです。

【最重要：創作・推測の禁止】
- 画像から確実に確認できる情報のみを使用すること
- 見えないもの、確認できないものについては「不明」「確認不可」と記載
- 憶測・仮説・想像に基づく記述は禁止
- 与えられた計算式・密度・空隙率の数値をそのまま使用すること

【回答形式】
- すべて日本語で回答
- 事実のみを簡潔に記述

### 誤検出防止ルール
1. **対象確認 (isTargetDetected)**:
   - トラックの荷台に廃棄物が積載されている場合のみtrue
   - 空車、乗用車、風景などはfalse
2. **確信度 (confidenceScore)**: 0.0〜1.0、迷いがあれば0.7以下
3. **ナンバープレート照合**: リストにない場合はnull、創作禁止`;

// 半楕円体方式（山盛り形状に適合）
const ELLIPSOID_VOLUME_PROMPT = `
【計算式】山盛りは半楕円体として計算
体積 = (2/3) × π × (length/2) × (width/2) × height
重量 = 体積 × 密度 × (1 - voidRatio)

【基準】4tダンプ荷台: 長さ3.4m、幅2.0m、後板高0.34m

【推定】
- height: 荷台床から山頂までの高さ(m)
- voidRatio: 塊間の隙間 + 半楕円体モデルと実形状の差を含めて判断

【前提】単一の廃棄物種類を積載

【密度】As殻=2.5、土砂=1.8 (t/m³)

【出力】JSON
{
  "isTargetDetected": boolean,
  "truckType": string,
  "licensePlate": string | null,
  "materialType": string,
  "length": number,
  "width": number,
  "height": number,
  "voidRatio": number,
  "estimatedVolumeM3": number,
  "estimatedTonnage": number,
  "confidenceScore": number,
  "reasoning": "計算過程"
}`;

// 台形体方式（従来）
const RUST_VOLUME_PROMPT = `
【計算式】
体積 = (upperArea + lowerArea) / 2 × height
重量 = 体積 × 密度 × (1 - voidRatio)

【基準】4tダンプ: 底面6.8m²、後板高0.34m

【推定】
- height: 後板高基準で実測(m)
- upperArea: 上面積(m²)
- voidRatio: 細かい0.30、普通0.35、大きい0.40

【密度】As殻2.5、土砂1.8 (t/m³)

【出力】JSON
{
  "isTargetDetected": boolean,
  "truckType": string,
  "licensePlate": string | null,
  "materialType": string,
  "lowerArea": number,
  "upperArea": number,
  "height": number,
  "voidRatio": number,
  "estimatedVolumeM3": number,
  "estimatedTonnage": number,
  "confidenceScore": number,
  "reasoning": "計算過程"
}`;

// 現行Web版プロンプト（互換性のため）
const CURRENT_SYSTEM_PROMPT = `あなたは建設廃棄物（ガラ）の重量推定を行うシステムです。
監視カメラまたは手動撮影された画像から、荷台の荷姿を解析し重量を推定します。

【最重要：創作・推測の禁止】
- 画像から確実に確認できる情報のみを使用すること
- 見えないもの、確認できないものについては「不明」「確認不可」と記載すること
- 憶測、仮説、想像に基づく記述は一切禁止
- 「〜と思われる」「〜かもしれない」「おそらく」等の曖昧表現は禁止
- 独自の理論や持論を展開しないこと
- 与えられた計算式・密度・空隙率の数値をそのまま使用すること

【回答形式】
- すべての回答は日本語で行ってください
- reasoningフィールドは必ず日本語で記述してください
- 事実のみを簡潔に記述すること`;

const CURRENT_VOLUME_PROMPT = `
【計算式】
体積 = (upperArea + lowerArea) / 2 × height
重量 = 体積 × 密度 × (1 - voidRatio)

【基準】4tダンプ: 底面7.0m²、後板高0.32m

【推定】
- height: 後板高基準で実測(m)
- upperArea: 上面積(m²)
- voidRatio: 塊サイズ(細0.30/普0.35/大0.40) + 積み方(きっちり+0/普通+0.05/乱雑+0.10/疎+0.15/板状+0.25) 最大0.65

【密度】As殻2.5、土砂1.8 (t/m³)

【出力】JSON
{
  "isTargetDetected": boolean,
  "truckType": string,
  "licensePlate": string | null,
  "materialType": string,
  "lowerArea": number,
  "upperArea": number,
  "height": number,
  "voidRatio": number,
  "estimatedVolumeM3": number,
  "estimatedTonnage": number,
  "confidenceScore": number,
  "reasoning": "計算過程"
}`;

// デフォルトプロンプト（リセット用）
export const DEFAULT_PROMPTS: Record<string, { systemPrompt: string; volumePrompt: string }> = {
  ellipsoid: { systemPrompt: RUST_SYSTEM_PROMPT, volumePrompt: ELLIPSOID_VOLUME_PROMPT },
  rust: { systemPrompt: RUST_SYSTEM_PROMPT, volumePrompt: RUST_VOLUME_PROMPT },
  current: { systemPrompt: CURRENT_SYSTEM_PROMPT, volumePrompt: CURRENT_VOLUME_PROMPT },
};

// プロンプトテンプレート一覧
export const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'ellipsoid',
    name: '半楕円体',
    description: '山盛り形状に最適化。体積精度向上',
    systemPrompt: RUST_SYSTEM_PROMPT,
    volumePrompt: ELLIPSOID_VOLUME_PROMPT,
    editable: true,
  },
  {
    id: 'rust',
    name: '台形体',
    description: '従来方式。空隙率0.30〜0.40',
    systemPrompt: RUST_SYSTEM_PROMPT,
    volumePrompt: RUST_VOLUME_PROMPT,
    editable: true,
  },
  {
    id: 'current',
    name: '2段階',
    description: '空隙率0.30〜0.65（塊+積み方補正）',
    systemPrompt: CURRENT_SYSTEM_PROMPT,
    volumePrompt: CURRENT_VOLUME_PROMPT,
    editable: true,
  },
];

// localStorage キー
const STORAGE_KEY_SELECTED = 'prompt_template_selected';
const STORAGE_KEY_VOLUME_PREFIX = 'prompt_volume_';

// 選択中のテンプレートIDを取得
export const getSelectedTemplateId = (): string => {
  return localStorage.getItem(STORAGE_KEY_SELECTED) || 'ellipsoid';
};

// テンプレートIDを保存
export const setSelectedTemplateId = (id: string): void => {
  localStorage.setItem(STORAGE_KEY_SELECTED, id);
};

// テンプレートのプロンプトを上書き保存
export const saveTemplatePrompt = (id: string, volumePrompt: string): void => {
  localStorage.setItem(STORAGE_KEY_VOLUME_PREFIX + id, volumePrompt);
};

// テンプレートのプロンプトを取得（編集済みがあればそれを返す）
export const getTemplatePrompt = (id: string): string => {
  const saved = localStorage.getItem(STORAGE_KEY_VOLUME_PREFIX + id);
  if (saved) return saved;
  const template = PROMPT_TEMPLATES.find(t => t.id === id);
  return template?.volumePrompt || '';
};

// テンプレートをデフォルトにリセット
export const resetTemplatePrompt = (id: string): void => {
  localStorage.removeItem(STORAGE_KEY_VOLUME_PREFIX + id);
};

// 現在選択されているテンプレートを取得
export const getSelectedTemplate = (): PromptTemplate => {
  const selectedId = getSelectedTemplateId();
  const template = PROMPT_TEMPLATES.find(t => t.id === selectedId);

  if (!template) {
    return PROMPT_TEMPLATES[0];
  }

  // localStorageに保存された編集済みプロンプトがあればそれを使用
  const savedVolume = localStorage.getItem(STORAGE_KEY_VOLUME_PREFIX + selectedId);
  if (savedVolume) {
    return {
      ...template,
      volumePrompt: savedVolume,
    };
  }

  return template;
};

// プロンプトをエクスポート（デバッグ用）
export const exportCurrentPrompt = (): string => {
  const template = getSelectedTemplate();
  return `=== System Prompt ===\n${template.systemPrompt}\n\n=== Volume Prompt ===\n${template.volumePrompt}`;
};

// 後方互換性のため残す（使用箇所があれば）
export const saveCustomPrompt = saveTemplatePrompt;
export const getCustomPrompt = () => {
  const id = getSelectedTemplateId();
  const template = PROMPT_TEMPLATES.find(t => t.id === id)!;
  return {
    systemPrompt: template.systemPrompt,
    volumePrompt: getTemplatePrompt(id),
  };
};
