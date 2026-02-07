import { ChatMessage, LearningFeedback, StockItem } from "../types";
import { TRUCK_SPECS_PROMPT, WEIGHT_FORMULA_PROMPT, LOAD_GRADES_PROMPT } from "../constants";
import { GradedStockItem } from "../services/stockService";

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
): { prompt: string; imageParts: any[] } {
  const imageParts: any[] = [];
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
): { prompt: string; imageParts: any[] } {
  const imageParts: any[] = [];
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

  const maxCapacityInstruction = buildMaxCapacityInstruction(maxCapacity);
  const userFeedbackSection = buildUserFeedbackSection(userFeedback);
  const learningFeedbackSection = buildLearningFeedbackSection(learningFeedback);

  return `画像の内容を判定し、重量を推定してください。

${maxCapacityInstruction}

【車両規格別 荷台容積（基準値）】
${TRUCK_SPECS_PROMPT}
※ すり切り=あおり高さまで、山盛り=すり切り×1.3

【重量計算の基準】
${WEIGHT_FORMULA_PROMPT}

■ 体積の判定方法
1. 車両規格を特定し、上記の基準容積を参照
2. 荷台の埋まり具合を目視で判定（例: すり切りの80%、山盛り等）
3. 基準容積 × 埋まり具合 = 見かけ体積

【空隙率の判定基準】★必ず2段階で判定すること

STEP1: 塊サイズで基準値を決定
- 細かい（〜30cm）: 0.30
- 普通（30〜60cm）: 0.35
- 大きい（60cm〜）: 0.40

STEP2: 積み方で補正値を加算（必須）
- きっちり詰めている（隙間が少ない）: +0.00
- 普通に積んでいる: +0.05
- 乱雑に積んでいる（隙間が見える）: +0.10
- 非常に疎（隙間だらけ）: +0.15

最終空隙率 = STEP1 + STEP2

【計算例】
- 大きい塊(0.40) + 乱雑(+0.10) = 0.50
- 大きい塊(0.40) + 非常に疎(+0.15) = 0.55
- 普通の塊(0.35) + 普通(+0.05) = 0.40

★「隙間が多い」と判断したら、必ず補正を加算せよ（0.40のまま使うな）

【高さ推定】★最重要：高さの過小評価は重量の過小評価に直結する

■ 高さとは「最高点」のこと（平均ではない）
- 高さ = 荷台床面から積載物の最高点までの距離
- 山の傾斜は「上面積比率」で調整するので、高さは最高点で測る
- 平らに均した想定の高さではない

■ 高さの測り方（自由推定）
1. 後板（あおり）の上端を基準点とする（4tダンプ: 0.32m）
2. 積載物の最高点が後板上端からどれだけ上にあるかを判定
3. 後板と同じ高さ分上に出ていれば「2.0倍」= 0.64m
4. 小数点以下まで自由に推定（1.75倍、1.92倍など）

■ 判定の目安
- 後板上端ギリギリ → 1.0倍 → 0.32m
- 後板の半分の高さ分、上に出ている → 1.5倍 → 0.48m
- 後板と同じ高さ分、上に出ている → 2.0倍 → 0.64m
- 後板より高く出ている → 2.5倍以上もありうる

■ 上面積比率（山の形状）
- 平らな山（台形に近い）: 70-80%
- 普通の山盛り: 55-65%
- 尖った山（三角形に近い）: 40-50%

★警告: 高さを控えめに見積もる癖があるなら、見た目より1.2倍して報告せよ

【幻覚禁止】存在しない空間を創作するな
- 「隅に空間がある」「一部が空いている」等は、明確に見える場合のみ記載
- 見えないものを推測で補わない
- 荷台がガラで埋まっているなら「みっちり積載」と判定する
- 上面積比率は、山の形状（平ら/山型/尖った山型）から判定する

【体積計算式】（台形体として計算）
体積 = (底面積 + 上面積) / 2 × 高さ
- 4tダンプ底面積: 3.4m × 2.06m = 7.0m²
- 増トン底面積: 4.0m × 2.2m = 8.8m²

例: 4tダンプ、高さ0.51m（1.5倍）、上面積55%の場合
→ (7.0 + 3.85) / 2 × 0.51 = 2.77m³

【積載量の現実チェック】
- 4tダンプでも高く積めば4t超になることは普通にある
- 推定値が最大積載量を超えても、それが視覚的に妥当なら正しい推定として報告する
- 「積みすぎ」かどうかの判断は推定精度とは別問題

■ 錐台充填割合（frustumRatio: 0.3〜1.0）
- 荷台を目一杯積んだ時の理想的な錐台形状に対して、実際にどれくらい充填されているかの割合
- 1.0 = 錐台にきっちり充填（山盛り・満載）
- 0.7〜0.8 = やや少なめだが十分に積載
- 0.5 = 半分程度
- 0.3 = 少量
- 【重要】後板付近の脱落防止用の傾斜は減点しないこと（安全対策であり荷量不足ではない）
- frustumRatioは体積計算に反映すること（estimatedVolumeM3に反映済みの値を出力）

【回答ルール（厳守）】
- 事実のみを記述し、推測・創作・持論は一切禁止
- reasoningには以下の形式で記載:
  「車両: ○tダンプ。積載状態: ○○。体積: (○m²+○m²)/2×○m=○m³。素材: ○○、塊サイズ○○。密度○t/m³、空隙率○を適用。計算: ○×○×(1-○)=○t」
- 計算式: 体積 × 密度 × (1-空隙率) = 推定重量
- maxCapacityReasoningには視覚的根拠のみを記載（確認できない情報は「確認不可」）
- 与えられたパラメータ（密度・空隙率）をそのまま使用すること。独自の数値を使わないこと
${hasTaggedStock ? '- 【重要】実測データがある場合は、類似の積載状況を参考に推定精度を向上させること' : '- 過去の推定結果があっても無視し、この画像の視覚的特徴のみから独立して判断すること'}
${refImagePrompt}${taggedStockPrompt}
${userFeedbackSection}
${learningFeedbackSection}
すべての回答は日本語で行ってください。`;
}
