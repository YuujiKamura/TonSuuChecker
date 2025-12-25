
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
    maxCapacity: 4,
    bedLength: 3.4,
    bedWidth: 2.06,
    bedHeight: 0.34,
    levelVolume: 2.4,
    heapVolume: 3.1,
    soilEquivalent: 2.2
  },
  '8t': {
    maxCapacity: 8,
    bedLength: 4.0,
    bedWidth: 2.2,
    bedHeight: 0.40,
    levelVolume: 3.5,
    heapVolume: 4.6,
    soilEquivalent: 4.4
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

// 空隙率基準マスタ
export const VOID_RATIOS = {
  tight: { min: 0.10, max: 0.15, desc: '細かく砕けている、締まっている' },
  normal: { min: 0.15, max: 0.20, desc: '標準的な状態' },
  loose: { min: 0.20, max: 0.30, desc: '塊が大きい、ゴロゴロしている' },
};

// 空隙率をプロンプト用テキストに変換
export const VOID_RATIOS_PROMPT = Object.entries(VOID_RATIOS)
  .map(([, v]) => `- ${v.desc} → ${Math.round(v.min * 100)}〜${Math.round(v.max * 100)}%`)
  .join('\n');

// 重量計算式プロンプト（共通）
export const WEIGHT_FORMULA_PROMPT = `重量 = 見かけ体積(m³) × 密度(t/m³) × (1 - 空隙率)

■ 素材別密度（参考値）
${MATERIAL_DENSITIES_PROMPT}

■ 空隙率（10〜30%の範囲で見た目から判断）
${VOID_RATIOS_PROMPT}`;

export const SYSTEM_PROMPT = `あなたは建設廃棄物（ガラ）の重量推論エキスパートです。
監視カメラまたは手動撮影された画像から、荷台の荷姿を解析し重量を推定します。

【重要】すべての回答は日本語で行ってください。特にreasoningフィールドは必ず日本語で記述してください。

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
4. **重量推定のロジック**:
   - 車種（2t, 4t, 10t等）の最大積載量と、荷台の埋まり具合（立米）、材質の比重を掛け合わせて算出。

必ず以下のJSONフォーマットで回答してください。すべての文字列フィールド（truckType, licensePlate, licenseNumber, materialType, reasoning, material等）は日本語で記述してください。
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
