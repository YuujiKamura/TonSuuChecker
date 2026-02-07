import { describe, it, expect, beforeEach } from 'vitest';
import { LOAD_GRADES } from '../domain/specs';
import { getLoadGrade } from '../domain/logic';
import { getTruckClass, selectStockByGrade, GradedStockItem } from '../services/stockService';
import { addVehicle } from '../services/referenceImages';
import * as idb from '../services/indexedDBService';

// テスト用のサンプル画像
const SAMPLE_BASE64_IMAGE = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBEQCEAwEPwCwAB//Z';

describe('等級選択ロジック', () => {
  beforeEach(async () => {
    // テスト前にDBをクリア
    const db = await idb.getDB();
    await db.clear('stock');
    await db.clear('vehicles');
  });

  describe('LOAD_GRADES定義', () => {
    it('5等級が定義されている', () => {
      expect(LOAD_GRADES.length).toBe(5);
      expect(LOAD_GRADES.map(g => g.name)).toEqual([
        '軽すぎ', '軽め', 'ちょうど', 'ギリOK', '積みすぎ'
      ]);
    });

    it('等級の境界値が正しい', () => {
      expect(LOAD_GRADES[0]).toEqual({ name: '軽すぎ', minRatio: 0, maxRatio: 80 });
      expect(LOAD_GRADES[1]).toEqual({ name: '軽め', minRatio: 80, maxRatio: 90 });
      expect(LOAD_GRADES[2]).toEqual({ name: 'ちょうど', minRatio: 90, maxRatio: 95 });
      expect(LOAD_GRADES[3]).toEqual({ name: 'ギリOK', minRatio: 95, maxRatio: 100 });
      expect(LOAD_GRADES[4]).toEqual({ name: '積みすぎ', minRatio: 100, maxRatio: Infinity });
    });
  });

  describe('getLoadGrade', () => {
    it('軽すぎ: 80%未満', () => {
      // 3.5t車で2.0t = 57%
      expect(getLoadGrade(2.0, 3.5).name).toBe('軽すぎ');
      // 3.5t車で2.79t = 79.7%
      expect(getLoadGrade(2.79, 3.5).name).toBe('軽すぎ');
    });

    it('軽め: 80%〜90%', () => {
      // 3.5t車で2.8t = 80%
      expect(getLoadGrade(2.8, 3.5).name).toBe('軽め');
      // 3.5t車で3.14t = 89.7%
      expect(getLoadGrade(3.14, 3.5).name).toBe('軽め');
    });

    it('ちょうど: 90%〜95%', () => {
      // 3.5t車で3.15t = 90%
      expect(getLoadGrade(3.15, 3.5).name).toBe('ちょうど');
      // 3.5t車で3.32t = 94.9%
      expect(getLoadGrade(3.32, 3.5).name).toBe('ちょうど');
    });

    it('ギリOK: 95%〜100%', () => {
      // 3.5t車で3.325t = 95%
      expect(getLoadGrade(3.325, 3.5).name).toBe('ギリOK');
      // 3.5t車で3.5t = 100%
      expect(getLoadGrade(3.5, 3.5).name).toBe('積みすぎ'); // 100%ぴったりは積みすぎ境界
      // 3.5t車で3.49t = 99.7%
      expect(getLoadGrade(3.49, 3.5).name).toBe('ギリOK');
    });

    it('積みすぎ: 100%超', () => {
      // 3.5t車で3.6t = 102.9%
      expect(getLoadGrade(3.6, 3.5).name).toBe('積みすぎ');
      // 3.5t車で4.0t = 114.3%
      expect(getLoadGrade(4.0, 3.5).name).toBe('積みすぎ');
    });

    it('4t車でも比率で正しく判定', () => {
      // 4.0t車で3.2t = 80%
      expect(getLoadGrade(3.2, 4.0).name).toBe('軽め');
      // 4.0t車で3.8t = 95%
      expect(getLoadGrade(3.8, 4.0).name).toBe('ギリOK');
    });
  });

  describe('getTruckClass', () => {
    it('2tクラス: 1.5〜2.5t', () => {
      expect(getTruckClass(1.5)).toBe('2t');
      expect(getTruckClass(2.0)).toBe('2t');
      expect(getTruckClass(2.5)).toBe('2t');
    });

    it('4tクラス: 3.0〜4.5t', () => {
      expect(getTruckClass(3.0)).toBe('4t');
      expect(getTruckClass(3.5)).toBe('4t');
      expect(getTruckClass(4.0)).toBe('4t');
      expect(getTruckClass(4.5)).toBe('4t');
    });

    it('増トンクラス: 5.0〜8.0t', () => {
      expect(getTruckClass(5.0)).toBe('増トン');
      expect(getTruckClass(6.5)).toBe('増トン');
      expect(getTruckClass(8.0)).toBe('増トン');
    });

    it('10tクラス: 9.0〜12.0t', () => {
      expect(getTruckClass(9.0)).toBe('10t');
      expect(getTruckClass(10.0)).toBe('10t');
      expect(getTruckClass(12.0)).toBe('10t');
    });

    it('unknown: 範囲外', () => {
      expect(getTruckClass(1.0)).toBe('unknown');
      expect(getTruckClass(2.8)).toBe('unknown');
      expect(getTruckClass(4.8)).toBe('unknown');
      expect(getTruckClass(8.5)).toBe('unknown');
      expect(getTruckClass(15.0)).toBe('unknown');
    });
  });

  describe('selectStockByGrade', () => {
    it('データがない場合は空配列', async () => {
      const result = await selectStockByGrade('4t');
      expect(result).toEqual([]);
    });

    it('同じ車両クラスのデータのみ選択される', async () => {
      // 4tクラスのデータを追加
      await idb.saveStock({
        id: 'test-4t-1',
        timestamp: Date.now(),
        base64Images: [SAMPLE_BASE64_IMAGE],
        imageUrls: [],
        actualTonnage: 3.0,
        maxCapacity: 3.5,
      });

      // 2tクラスのデータを追加
      await idb.saveStock({
        id: 'test-2t-1',
        timestamp: Date.now(),
        base64Images: [SAMPLE_BASE64_IMAGE],
        imageUrls: [],
        actualTonnage: 1.5,
        maxCapacity: 2.0,
      });

      const result4t = await selectStockByGrade('4t');
      const result2t = await selectStockByGrade('2t');

      expect(result4t.length).toBe(1);
      expect(result4t[0].id).toBe('test-4t-1');
      expect(result2t.length).toBe(1);
      expect(result2t[0].id).toBe('test-2t-1');
    });

    it('各等級から1件ずつ選択される', async () => {
      const now = Date.now();

      // 4tクラスで各等級のデータを追加
      // 軽すぎ: 2.5t / 3.5t = 71%
      await idb.saveStock({
        id: 'grade-1',
        timestamp: now - 1000,
        base64Images: [SAMPLE_BASE64_IMAGE],
        imageUrls: [],
        actualTonnage: 2.5,
        maxCapacity: 3.5,
      });

      // 軽め: 3.0t / 3.5t = 86%
      await idb.saveStock({
        id: 'grade-2',
        timestamp: now - 2000,
        base64Images: [SAMPLE_BASE64_IMAGE],
        imageUrls: [],
        actualTonnage: 3.0,
        maxCapacity: 3.5,
      });

      // ちょうど: 3.2t / 3.5t = 91%
      await idb.saveStock({
        id: 'grade-3',
        timestamp: now - 3000,
        base64Images: [SAMPLE_BASE64_IMAGE],
        imageUrls: [],
        actualTonnage: 3.2,
        maxCapacity: 3.5,
      });

      // ギリOK: 3.4t / 3.5t = 97%
      await idb.saveStock({
        id: 'grade-4',
        timestamp: now - 4000,
        base64Images: [SAMPLE_BASE64_IMAGE],
        imageUrls: [],
        actualTonnage: 3.4,
        maxCapacity: 3.5,
      });

      // 積みすぎ: 3.8t / 3.5t = 109%
      await idb.saveStock({
        id: 'grade-5',
        timestamp: now - 5000,
        base64Images: [SAMPLE_BASE64_IMAGE],
        imageUrls: [],
        actualTonnage: 3.8,
        maxCapacity: 3.5,
      });

      const result = await selectStockByGrade('4t');

      expect(result.length).toBe(5);
      expect(result.map(r => r.gradeName)).toEqual([
        '軽すぎ', '軽め', 'ちょうど', 'ギリOK', '積みすぎ'
      ]);
    });

    it('同じ等級に複数ある場合は最新のものが選択される', async () => {
      const now = Date.now();

      // 軽め等級に2件追加（古い方）
      await idb.saveStock({
        id: 'old-item',
        timestamp: now - 10000,
        base64Images: [SAMPLE_BASE64_IMAGE],
        imageUrls: [],
        actualTonnage: 3.0,
        maxCapacity: 3.5,
      });

      // 軽め等級（新しい方）
      await idb.saveStock({
        id: 'new-item',
        timestamp: now,
        base64Images: [SAMPLE_BASE64_IMAGE],
        imageUrls: [],
        actualTonnage: 2.9,
        maxCapacity: 3.5,
      });

      const result = await selectStockByGrade('4t');

      expect(result.length).toBe(1);
      expect(result[0].id).toBe('new-item');
    });

    it('GradedStockItemに等級情報が付与される', async () => {
      await idb.saveStock({
        id: 'test-graded',
        timestamp: Date.now(),
        base64Images: [SAMPLE_BASE64_IMAGE],
        imageUrls: [],
        actualTonnage: 3.2,
        maxCapacity: 3.5,
      });

      const result = await selectStockByGrade('4t');

      expect(result.length).toBe(1);
      expect(result[0].gradeName).toBe('ちょうど');
      expect(result[0].loadRatio).toBeCloseTo(91.4, 1);
    });

    it('実測値またはmaxCapacityがないデータは除外される', async () => {
      // actualTonnageがない
      await idb.saveStock({
        id: 'no-actual',
        timestamp: Date.now(),
        base64Images: [SAMPLE_BASE64_IMAGE],
        imageUrls: [],
        maxCapacity: 3.5,
      });

      // maxCapacityがない
      await idb.saveStock({
        id: 'no-max',
        timestamp: Date.now(),
        base64Images: [SAMPLE_BASE64_IMAGE],
        imageUrls: [],
        actualTonnage: 3.0,
      });

      const result = await selectStockByGrade('4t');
      expect(result.length).toBe(0);
    });
  });
});
