// --- localStorage helpers ---
const EXPORT_CONFIG_CACHE_KEY = 'tonsuuChecker_exportConfig';

const defaultExportConfig = {
  wasteType: 'アスファルト殻',
  destination: '',
  unit: 'ｔ',
  projectNumber: '',
  projectName: '',
  contractorName: '',
  siteManager: ''
};

export type ExportConfig = typeof defaultExportConfig;

export const loadExportConfig = (): ExportConfig => {
  try {
    const cached = localStorage.getItem(EXPORT_CONFIG_CACHE_KEY);
    if (cached) {
      return { ...defaultExportConfig, ...JSON.parse(cached) };
    }
  } catch (e) {
    console.error('キャッシュ読み込みエラー:', e);
  }
  return { ...defaultExportConfig };
};

export const saveExportConfig = (config: ExportConfig) => {
  try {
    localStorage.setItem(EXPORT_CONFIG_CACHE_KEY, JSON.stringify(config));
  } catch (e) {
    console.error('キャッシュ保存エラー:', e);
  }
};
