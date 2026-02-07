import { Part } from "@google/genai";
import { ChatMessage, LearningFeedback, StockItem } from "../types";
import { LOAD_GRADES_PROMPT } from "./weightEstimation";
import { GradedStockItem } from "../services/stockService";
import { buildCorePrompt } from "../domain/promptSpec.ts";

/**
 * maxCapacityが未指定の場合に使用する、車両サイズ推定用の詳細プロンプト
 */
const MAX_CAPACITY_ESTIMATION_PROMPT = `【最大積載量の推定 - 実寸法に基づく判定基準】
ユーザーから最大積載量が提供されていません。以下の実寸法データに基づいて推定してください。

【2tダンプの特徴】（日野デュトロ、いすゞエルフ、三菱キャンター）
- 全長: 約4.7m、全幅: 1.69m（狭い）、全高: 約2.0m
- 荷台長: 約3.0m、荷台幅: 約1.6m、あおり高: 32cm
- キャビン長: 約1.6m（荷台とほぼ同じ長さ）
- 特徴: 普通車並みの車幅、低い車高、小径タイヤ

【4tダンプの特徴】（三菱ファイター、日野レンジャー）
- 全長: 約5.4-5.8m、全幅: 2.19m（道路幅いっぱい）、全高: 約2.4-2.5m
- 荷台長: 約3.4m、荷台幅: 約2.0m、あおり高: 33-35cm
- キャビン長: 約2.0m（荷台より短い）
- 特徴: 幅広ボディ、2t比で明らかに大きいキャビン、大径タイヤ
- 【重要】4tクラスでも荷台補強等により車検上の最大積載量が3.5t〜3.8tになっている車両が非常に多い。「4tダンプ」と呼ばれていても実際の最大積載量は3.5t前後と考えるのが現実的

【8tダンプの特徴】（増トン車）
- 全長: 約6.5-7.0m、全幅: 2.49m、全高: 約2.8-3.0m
- 荷台長: 約4.0-4.5m、荷台幅: 約2.2m
- 特徴: 4tと10tの中間サイズ、後輪がダブルタイヤ

【10t/11tダンプの特徴】（日野プロフィア、いすゞギガ、三菱スーパーグレート）
- 全長: 約7.6-8.0m、全幅: 2.49m（法定上限）、全高: 約3.3-3.7m
- 荷台長: 約5.1-5.3m、荷台幅: 約2.2-2.35m、あおり高: 50cm
- キャビン長: 約2.5m（荷台の半分程度）
- 特徴: 非常に高い車高、巨大なキャビン、後輪ダブルタイヤ

【判別のポイント - ナンバープレート幅を実測して基準にする】
大型車ナンバープレート実寸: 幅440mm（44cm）

■ 手順
1. 画像内のナンバープレートの幅をピクセル単位で測定する
2. そのピクセル数を44cmとして換算係数を求める
3. 後板（あおり）の高さをピクセルで測定し、実寸に換算する

■ 後板高さによる車両判定
- 後板32cm以下 → 2tダンプ（ナンバー幅の約0.7倍）
- 後板33-40cm → 4tダンプ（ナンバー幅の約0.8倍）
- 後板45cm以上 → 8t/10tダンプ（ナンバー幅の約1.0倍以上）

→ 後板がナンバー幅と同等以上なら8t以上、明らかに低ければ2t/4t

■ その他の視覚的特徴
- キャビンと荷台の比率: 2tは同程度、大型は荷台が長い

【禁止事項】
- ナンバープレートの分類番号から積載量を推測しないこと（分類番号は積載量と無関係）
- 確認できない情報を推測・創作しないこと
- 独自の理論や解釈を展開しないこと
- 上記に記載されていない判定基準を使用しないこと`;

/**
 * maxCapacityの有無に応じた指示文を生成する
 */
function buildMaxCapacityInstruction(maxCapacity?: number): string {
  if (maxCapacity) {
    return `【重要】この車両の最大積載量は${maxCapacity}トンです。estimatedMaxCapacityには${maxCapacity}を設定してください。`;
  }
  return MAX_CAPACITY_ESTIMATION_PROMPT;
}

/**
 * 実測値付き過去データ（等級別）のプロンプトと画像パーツを生成する
 */
export function buildTaggedStockSection(
  taggedStock?: StockItem[]
): { prompt: string; imageParts: Part[] } {
  const imageParts: Part[] = [];
  let prompt = '';

  if (!taggedStock || taggedStock.length === 0) {
    return { prompt, imageParts };
  }

// GradedStockItem かどうかをチェック
  const isGraded = (item: StockItem): item is GradedStockItem =>
    'gradeName' in item && 'loadRatio' in item;

  prompt = `\n${LOAD_GRADES_PROMPT}\n\n【実測データ（等級別）】同じ車両クラスで過去に実測した画像です。「この見た目で何トンだったか」を参考にしてください。\n`;
  taggedStock.forEach((item, idx) => {
    if (item.base64Images[0]) {
      imageParts.push({ inlineData: { mimeType: 'image/jpeg', data: item.base64Images[0] } });
      if (isGraded(item)) {
        // 等級付きデータ
        prompt += `- 【${item.gradeName}】実測${item.actualTonnage}t / 最大${item.maxCapacity}t（${item.loadRatio.toFixed(0)}%）${item.memo ? ` ${item.memo}` : ''}\n`;
      } else {
        // 従来のデータ（後方互換）
        const ratio = item.actualTonnage && item.maxCapacity
          ? ((item.actualTonnage / item.maxCapacity) * 100).toFixed(0)
          : '?';
        prompt += `- 実測${item.actualTonnage}t / 最大${item.maxCapacity}t（${ratio}%）${item.memo ? ` ${item.memo}` : ''}\n`;
      }
    }
  });
  prompt += '\n※ 上記の実測データと見比べて、解析対象がどの等級に近いか判断してください。\n';
  

  return { prompt, imageParts };
}

/**
 * ユーザーフィードバックセクションを生成する
 */
function buildUserFeedbackSection(userFeedback?: ChatMessage[]): string {
  if (!userFeedback || userFeedback.length === 0) return '';

  return `
【ユーザーからの指摘・修正】
以下は前回の解析結果に対するユーザーからのフィードバックです。これらの指摘を考慮して再解析してください。
※ 数値は参考程度に。自身の推論で判断すること。
${userFeedback.map(msg => {
  // ユーザーメッセージから実測値と思われる数値をマスク
  const content = msg.role === 'user'
    ? msg.content.replace(/(\d+\.?\d*)\s*(t|トン|kg|キロ)/gi, '[数値]$2')
    : msg.content;
  return `${msg.role === 'user' ? 'ユーザー' : 'AI'}: ${content}`;
}).join('\n')}
`;
}

/**
 * 学習フィードバックセクションを生成する
 */
function buildLearningFeedbackSection(learningFeedback?: LearningFeedback[]): string {
  if (!learningFeedback || learningFeedback.length === 0) return '';

  return `
【過去の学習データ（重要）】
以下は過去の解析で得られた重要な指摘・知見です。同様の状況では必ずこれらを考慮してください。
${learningFeedback.map((fb, idx) => {
  const typeLabel = fb.feedbackType === 'correction' ? '訂正' : fb.feedbackType === 'insight' ? '知見' : 'ルール';
  // 具体的な数値は教えず、傾向のみを伝える
  const directionHint = fb.actualTonnage && fb.aiEstimation
    ? (fb.actualTonnage > fb.aiEstimation ? '（AI推定は過小傾向だった）' : fb.actualTonnage < fb.aiEstimation ? '（AI推定は過大傾向だった）' : '')
    : '';
  return `${idx + 1}. [${typeLabel}] ${fb.summary}${directionHint}`;
}).join('\n')}
`;
}

/**
 * 参考画像（登録車両）のプロンプトと画像パーツを生成する
 */
export function buildReferenceImageSection(
  referenceImages: Array<{ name: string; base64: string; maxCapacity: number; mimeType?: string }>
): { prompt: string; imageParts: Part[] } {
  const imageParts: Part[] = [];
  let prompt = '';

  if (referenceImages.length === 0) {
    return { prompt, imageParts };
  }

  prompt = '\n【登録車両】以下は登録済み車両の画像です。解析対象の車両と比較して、最も近い車両を特定し、その最大積載量を参考にしてください。\n';
  referenceImages.forEach((ref, idx) => {
    const mimeType = ref.mimeType || 'image/jpeg';
    imageParts.push({ inlineData: { mimeType, data: ref.base64 } });
    prompt += `- 登録車両${idx + 1}: ${ref.name}（最大積載量: ${ref.maxCapacity}t）\n`;
  });

  return { prompt, imageParts };
}

export interface InferencePromptOptions {
  maxCapacity?: number;
  userFeedback?: ChatMessage[];
  learningFeedback?: LearningFeedback[];
  hasTaggedStock: boolean;
  refImagePrompt: string;
  taggedStockPrompt: string;
}

/**
 * メイン推論プロンプトを構築する
 *
 * runSingleInference内で使われていた大きなテンプレート文字列を関数化したもの。
 * 画像パーツの組み立ては呼び出し元の責務とし、ここではテキスト部分のみ返す。
 */
export function buildInferencePrompt(options: InferencePromptOptions): string {
  const {
    maxCapacity,
    userFeedback,
    learningFeedback,
    hasTaggedStock,
    refImagePrompt,
    taggedStockPrompt,
  } = options;

  // Core prompt: CLI版のコンパクトプロンプト形式（prompt-spec.json SSOT から生成）
  const corePrompt = buildCorePrompt();

  // Web extensions
  const maxCapacityInstruction = buildMaxCapacityInstruction(maxCapacity);
  const userFeedbackSection = buildUserFeedbackSection(userFeedback);
  const learningFeedbackSection = buildLearningFeedbackSection(learningFeedback);

  return `${corePrompt}

${maxCapacityInstruction}
${hasTaggedStock ? '- 【重要】実測データがある場合は、類似の積載状況を参考に推定精度を向上させること' : '- 過去の推定結果があっても無視し、この画像の視覚的特徴のみから独立して判断すること'}
${refImagePrompt}${taggedStockPrompt}
${userFeedbackSection}
${learningFeedbackSection}
すべての回答は日本語で行ってください。`;
}
