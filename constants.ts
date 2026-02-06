
// 車両規格マスタ（荷台寸法・容積の基準値）
export interface TruckSpec {
  maxCapacity: number;      // 最大積載量 (t)
  bedLength: number;        // 荷台長 (m)
  bedWidth: number;         // 荷台幅 (m)
  bedHeight: number;        // あおり高 (m)
  levelVolume: number;      // すり切り容量 (m³)
  heapVolume: number;       // 山盛り容量 (m³) ※係数1.3
  soilEquivalent: number;   // 土砂換算容量 (m³) ※比重1.8で計算
}

export const TRUCK_SPECS: Record<string, TruckSpec> = {
  '2t': {
    maxCapacity: 2,
    bedLength: 3.0,
    bedWidth: 1.6,
    bedHeight: 0.32,
    levelVolume: 1.5,
    heapVolume: 2.0,
    soilEquivalent: 1.1
  },
  '4t': {
    // いすゞフォワード基準
    maxCapacity: 4,
    bedLength: 3.4,
    bedWidth: 2.06,
    bedHeight: 0.32,
    levelVolume: 2.2,
    heapVolume: 2.9,
    soilEquivalent: 2.2
  },
  '増トン': {
    // 増トン車: 中型フレームベースで積載量を増やした車両（5〜8t積載）
    // 日野レンジャー、いすゞフォワード、三菱ファイター等のメーカー純正ラインナップ
    // 見分け方: 荷台のボリューム感が4tより明らかに大きいが、10tほどではない
    maxCapacity: 6.5,  // 一般的な増トンダンプ
    bedLength: 4.0,
    bedWidth: 2.2,
    bedHeight: 0.40,
    levelVolume: 3.5,
    heapVolume: 4.6,
    soilEquivalent: 3.6
  },
  '10t': {
    maxCapacity: 10,
    bedLength: 5.3,
    bedWidth: 2.3,
    bedHeight: 0.50,
    levelVolume: 6.0,
    heapVolume: 7.8,
    soilEquivalent: 5.5
  }
};

// 車両規格をプロンプト用テキストに変換
export const TRUCK_SPECS_PROMPT = Object.entries(TRUCK_SPECS)
  .map(([name, spec]) =>
    `- ${name}ダンプ: 荷台${spec.bedLength}m×${spec.bedWidth}m×${spec.bedHeight}m, すり切り${spec.levelVolume}m³, 山盛り${spec.heapVolume}m³, 最大積載${spec.maxCapacity}t`
  ).join('\n');

// 素材別密度マスタ (t/m³)
export const MATERIAL_DENSITIES: Record<string, number> = {
  '土砂': 1.8,
  'As殻': 2.5,
  'アスファルトガラ': 2.5,
  'Co殻': 2.5,
  'コンクリートガラ': 2.5,
  '開粒度As殻': 2.35,
};

// 素材密度をプロンプト用テキストに変換
export const MATERIAL_DENSITIES_PROMPT = Object.entries(MATERIAL_DENSITIES)
  .filter(([name]) => !name.includes('ガラ'))  // エイリアスは除外
  .map(([name, density]) => `- ${name}: ${density} t/m³`)
  .join('\n');

// 空隙率基準マスタ（見た目による判断用）
export const VOID_RATIOS = {
  tight: { min: 0.10, max: 0.15, desc: '細かく砕けている、締まっている' },
  normal: { min: 0.15, max: 0.20, desc: '標準的な状態' },
  loose: { min: 0.20, max: 0.30, desc: '塊が大きい、ゴロゴロしている' },
};

// 素材別空隙率マスタ（素材特性に基づく推奨値）
export const MATERIAL_VOID_RATIOS: Record<string, { typical: number; range: [number, number]; desc: string }> = {
  '土砂': { typical: 0.05, range: [0.03, 0.08], desc: '粒子が細かく締まりやすい' },
  'As殻': { typical: 0.30, range: [0.25, 0.35], desc: '塊状で隙間が多い' },
  'アスファルトガラ': { typical: 0.30, range: [0.25, 0.35], desc: '塊状で隙間が多い' },
  'Co殻': { typical: 0.30, range: [0.25, 0.35], desc: '塊状で隙間が多い' },
  'コンクリートガラ': { typical: 0.30, range: [0.25, 0.35], desc: '塊状で隙間が多い' },
  '開粒度As殻': { typical: 0.35, range: [0.30, 0.40], desc: '多孔質で空隙が特に多い' },
};

// 素材別空隙率をプロンプト用テキストに変換
export const MATERIAL_VOID_RATIOS_PROMPT = Object.entries(MATERIAL_VOID_RATIOS)
  .filter(([name]) => !name.includes('ガラ'))  // エイリアスは除外
  .map(([name, v]) => `- ${name}: 標準${Math.round(v.typical * 100)}%（${Math.round(v.range[0] * 100)}〜${Math.round(v.range[1] * 100)}%）← ${v.desc}`)
  .join('\n');

// 空隙率をプロンプト用テキストに変換（後方互換用）
export const VOID_RATIOS_PROMPT = Object.entries(VOID_RATIOS)
  .map(([, v]) => `- ${v.desc} → ${Math.round(v.min * 100)}〜${Math.round(v.max * 100)}%`)
  .join('\n');

// バックホウ（油圧ショベル）バケット容量マスタ
// ※山積容量（新JIS基準: 1:1勾配）
export interface BucketSpec {
  capacity: number;      // バケット山積容量 (m³)
  machineClass: string;  // 機体クラス
  typicalWeight: number; // 土砂換算重量 (t) ※密度1.8で計算
}

export const BUCKET_SPECS: Record<string, BucketSpec> = {
  'コンマ1': { capacity: 0.1, machineClass: '3tクラス', typicalWeight: 0.15 },
  'コンマ2': { capacity: 0.2, machineClass: '5tクラス', typicalWeight: 0.29 },
  'コンマ25': { capacity: 0.25, machineClass: '7tクラス', typicalWeight: 0.36 },
  'コンマ45': { capacity: 0.45, machineClass: '12tクラス', typicalWeight: 0.65 },
  'コンマ7': { capacity: 0.7, machineClass: '20tクラス', typicalWeight: 1.0 },
  'コンマ9': { capacity: 0.9, machineClass: '25tクラス', typicalWeight: 1.3 },
};

// バケット容量をプロンプト用テキストに変換
export const BUCKET_SPECS_PROMPT = Object.entries(BUCKET_SPECS)
  .map(([name, spec]) =>
    `- ${name}（${spec.capacity}m³）: ${spec.machineClass}、土砂一杯で約${spec.typicalWeight}t`
  ).join('\n');

// 積載等級の定義（実測値 / 最大積載量）
export interface LoadGrade {
  name: string;      // 等級名
  minRatio: number;  // 下限（%）
  maxRatio: number;  // 上限（%）
}

export const LOAD_GRADES: LoadGrade[] = [
  { name: '軽すぎ', minRatio: 0, maxRatio: 80 },
  { name: '軽め', minRatio: 80, maxRatio: 90 },
  { name: 'ちょうど', minRatio: 90, maxRatio: 95 },
  { name: 'ギリOK', minRatio: 95, maxRatio: 100 },
  { name: '積みすぎ', minRatio: 100, maxRatio: Infinity },
];

// 積載率から等級を取得
export const getLoadGrade = (actualTonnage: number, maxCapacity: number): LoadGrade => {
  const ratio = (actualTonnage / maxCapacity) * 100;
  return LOAD_GRADES.find(g => ratio >= g.minRatio && ratio < g.maxRatio) || LOAD_GRADES[LOAD_GRADES.length - 1];
};

// 等級定義をプロンプト用テキストに変換
export const LOAD_GRADES_PROMPT = `■ 積載等級（実測値 ÷ 最大積載量）
${LOAD_GRADES.map(g =>
  g.maxRatio === Infinity
    ? `- ${g.name}: ${g.minRatio}%超`
    : `- ${g.name}: ${g.minRatio}〜${g.maxRatio}%`
).join('\n')}

※ 過去の実測データは等級別に提供されます。「この見た目で何トンだったか」を参考に推定してください。`;

// 重量計算式プロンプト（共通）
export const WEIGHT_FORMULA_PROMPT = `重量 = 見かけ体積(m³) × 密度(t/m³) × (1 - 空隙率)

■ 素材別パラメータ（重要：素材によって密度・空隙率が大きく異なる）
${MATERIAL_DENSITIES_PROMPT}

■ 素材別空隙率（必ず素材特性に基づいて適用すること）
${MATERIAL_VOID_RATIOS_PROMPT}

【計算例】
- 土砂2.0m³の場合: 2.0 × 1.8 × (1-0.05) = 3.42t
- As殻2.0m³の場合: 2.0 × 2.5 × (1-0.30) = 3.50t
- ガラは密度が高いが空隙率も高いため、土砂と同程度の重量になることが多い`;

export const SYSTEM_PROMPT = `あなたは建設廃棄物（ガラ）の重量推定を行うシステムです。
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
- 事実のみを簡潔に記述すること

### 誤検出防止 & 高速化ルール (CRITICAL)
1. **対象確認 (isTargetDetected)**: 
   - 以下の条件をすべて満たさない場合は必ず false にし、reasoning以外の項目はnullや0にして即答してください。
     - 明確に「トラック」の車体（特に荷台部分）が写っている。
     - 荷台に「廃棄物（コンクリートガラ、アスガラ、混廃等）」が積載されている。
     - 空車、乗用車、通行人、風景、または判別不能なほど遠い・暗い画像は「false」です。
2. **確信度 (confidenceScore)**:
   - 0.0〜1.0で評価。少しでも迷いがある場合は 0.7 以下に設定してください。
3. **ナンバープレートの抽出**:
   - 地名、分類番号、ひらがな、一連指定番号（4桁）を特定してください。
4. **重量推定のロジック（この計算式のみを使用すること）**:
   - 重量 = 見かけ体積(m³) × 密度(t/m³) × (1 - 空隙率)
   - 上記の式以外の計算方法を使用しないこと
   - 密度・空隙率は後述の素材別パラメータを使用すること

   【荷台容量の定義】
   - すり切り = 側板・後板の上端まで（アオリを倒した状態）
   - 山盛り = アオリを立てた状態の上端まで
   - 4tダンプ: すり切り約2.0m³、山盛り約2.4m³

   【ガラ積載の特性（重要）】
   - ガラ（As殻・Co殻）は流動性がなく、ブロック状に積み重ね可能
   - 土砂のように崩れて山型にならず、真四角・箱型に積める
   - アオリを立てた状態で上端まで箱型に積むと約2.4m³（山盛り容量）
   - ガラは箱型に積めるため、山盛り容量をフルに使える
   - 4tダンプの場合: アオリ上端まで箱型 → 約2.4m³、さらに山盛り → 2.6〜2.8m³

5. **状況認識 (CRITICAL)**:
   - バックホウ・ショベル・ユンボ等の重機が写っている場合は「積込作業中」と認識する。
   - 積込作業中の場合（estimatedVolumeM3 / estimatedTonnage には画像に写っている全体を反映）:
     - バケット内に土砂・ガラがあれば、それも含めて推定する（写真に写っているものを推定するのが正解）
     - バケットの規格（コンマ〇〇）を機体サイズから推定し、一杯あたりの容量・重量を計算に含める
     - 荷台が空でもバケットに積載物があれば、その分を estimatedTonnage に反映する
   - reasoningには以下を必ず明記:
     - 現場の状況（積込作業中、待機中、搬出中など）
     - 「荷台のみ」の推定値と「バケット込み」の推定値を両方記載
     - バケットの推定規格（例: コンマ45）とその容量
     - 最終的な estimatedTonnage がどの値を採用したか明記
6. **外部検索の活用（外形から機種を推定して検索）**:
   - 【登録車両優先】プロンプトに「登録車両」情報がある場合は、それを優先して使用（検索不要）
   - 登録車両にマッチしない場合のみ、以下の手順で外部検索を行う:

   ■ ダンプトラックの機種推定と検索
   - キャビン形状、車体の色、メーカーロゴ、サイズ感から機種を推定

   【増トン車という概念】
   - 増トン車 = 中型フレームベースで積載量を増やした車両（5〜8t積載可能）
   - 後付け改造ではなく、日野レンジャー・いすゞフォワード・三菱ファイター等のメーカー純正ラインナップ
   - 見分け方: 荷台のボリューム感が4tとは明らかに違う（大きい）が、10tほどではない
   - 4tと10tの中間サイズに見える → 増トンの可能性を考慮
   - 検索時は「日野レンジャー 8t 荷台寸法」「増トン ダンプ 荷台寸法」等が有効

   - 検索例:
     - 白いダンプ、2tクラス、いすゞっぽい → 「いすゞエルフ 2t ダンプ 荷台寸法」
     - 青いダンプ、4tクラス、日野っぽい → 「日野レンジャー 4t 荷台寸法」
     - 中型だが4tより大きい、後輪ダブル → 「増トン ダンプ 6.5t 荷台寸法」
     - 大型ダンプ、10tクラス → 「日野プロフィア 10t ダンプ 荷台寸法」

   ■ バックホウ・重機の機種推定と検索
   - 車体の色、サイズ感から機種を推定
   - 検索例:
     - 黄色いバックホウ、12tクラス → 「コマツ PC120 バケット容量」
     - オレンジの重機、20tクラス → 「日立 ZX200 バケット容量」

   ■ 検索結果の記載
   - reasoning に「検索で確認: 日野レンジャーの荷台寸法は3.4m×2.0m」のように明記する
   - 機種が推定できない場合や検索結果が不明確な場合は、下記の目安値を使用する

【バックホウ バケット容量の目安】
${BUCKET_SPECS_PROMPT}

必ず以下のJSONフォーマットで回答してください。すべての文字列フィールドは日本語で記述してください。

【reasoningフィールドの書式（厳守）】
以下の形式で簡潔に記載すること。創作や持論は一切禁止。
「車両: ○tダンプ。体積: ○m³（すり切りの○%）。素材: ○○。密度○t/m³、空隙率○%を適用。計算: ○×○×(1-○)=○t」

{
  "isTargetDetected": boolean,
  "truckType": string,
  "licensePlate": string | null,
  "licenseNumber": string | null,
  "materialType": string,
  "estimatedVolumeM3": number,
  "estimatedTonnage": number,
  "confidenceScore": number,
  "reasoning": string,
  "materialBreakdown": [{"material": string, "percentage": number, "density": number}]
}`;
