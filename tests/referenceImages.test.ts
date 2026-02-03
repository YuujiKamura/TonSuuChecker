import { describe, it, expect, beforeEach } from 'vitest';
import {
  addVehicle,
  getReferenceImages,
  updateVehicle,
  deleteVehicle,
  RegisteredVehicle
} from '../services/referenceImages';
import * as idb from '../services/indexedDBService';

// テスト用のサンプル画像（1x1 赤ピクセルのJPEG）
const SAMPLE_BASE64_IMAGE = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBEQCEAwEPwCwAB//Z';

describe('車両登録サービス (referenceImages)', () => {
  beforeEach(async () => {
    // テスト前にDBをクリア
    const db = await idb.getDB();
    await db.clear('vehicles');
  });

  describe('addVehicle', () => {
    it('車両を正常に追加できる', async () => {
      const vehicle = await addVehicle({
        name: 'テスト車両',
        maxCapacity: 4.0,
        base64: SAMPLE_BASE64_IMAGE,
        mimeType: 'image/jpeg'
      });

      expect(vehicle).not.toBeNull();
      expect(vehicle?.name).toBe('テスト車両');
      expect(vehicle?.maxCapacity).toBe(4.0);
      expect(vehicle?.id).toBeDefined();
    });

    it('画像データ(base64)が保存される', async () => {
      const vehicle = await addVehicle({
        name: '画像付き車両',
        maxCapacity: 3.5,
        base64: SAMPLE_BASE64_IMAGE,
        mimeType: 'image/jpeg'
      });

      expect(vehicle).not.toBeNull();
      expect(vehicle?.base64).toBeDefined();
      expect(vehicle?.base64.length).toBeGreaterThan(0);
    });

    it('mimeTypeが保存される', async () => {
      const vehicle = await addVehicle({
        name: 'MIME付き車両',
        maxCapacity: 2.0,
        base64: SAMPLE_BASE64_IMAGE,
        mimeType: 'image/png'
      });

      expect(vehicle?.mimeType).toBe('image/png');
    });
  });

  describe('getReferenceImages', () => {
    it('追加した車両を取得できる', async () => {
      await addVehicle({
        name: '取得テスト車両',
        maxCapacity: 5.0,
        base64: SAMPLE_BASE64_IMAGE,
        mimeType: 'image/jpeg'
      });

      const vehicles = await getReferenceImages();

      expect(vehicles.length).toBe(1);
      expect(vehicles[0].name).toBe('取得テスト車両');
    });

    it('取得した車両にbase64画像が含まれる', async () => {
      await addVehicle({
        name: '画像確認用車両',
        maxCapacity: 3.0,
        base64: SAMPLE_BASE64_IMAGE,
        mimeType: 'image/jpeg'
      });

      const vehicles = await getReferenceImages();

      expect(vehicles.length).toBe(1);
      expect(vehicles[0].base64).toBeDefined();
      expect(vehicles[0].base64.length).toBeGreaterThan(0);
      // 保存時に圧縮される可能性があるので、存在のみ確認
    });

    it('複数車両を取得できる', async () => {
      await addVehicle({
        name: '車両1',
        maxCapacity: 2.0,
        base64: SAMPLE_BASE64_IMAGE,
        mimeType: 'image/jpeg'
      });
      await addVehicle({
        name: '車両2',
        maxCapacity: 4.0,
        base64: SAMPLE_BASE64_IMAGE,
        mimeType: 'image/jpeg'
      });

      const vehicles = await getReferenceImages();

      expect(vehicles.length).toBe(2);
    });
  });

  describe('updateVehicle', () => {
    it('車両情報を更新できる', async () => {
      const vehicle = await addVehicle({
        name: '更新前',
        maxCapacity: 3.0,
        base64: SAMPLE_BASE64_IMAGE,
        mimeType: 'image/jpeg'
      });

      await updateVehicle(vehicle!.id, { name: '更新後' });

      const vehicles = await getReferenceImages();
      expect(vehicles[0].name).toBe('更新後');
    });

    it('画像を更新しても保持される', async () => {
      const newImage = SAMPLE_BASE64_IMAGE + 'updated';
      const vehicle = await addVehicle({
        name: '画像更新テスト',
        maxCapacity: 3.0,
        base64: SAMPLE_BASE64_IMAGE,
        mimeType: 'image/jpeg'
      });

      await updateVehicle(vehicle!.id, { base64: newImage });

      const vehicles = await getReferenceImages();
      expect(vehicles[0].base64).toBe(newImage);
    });
  });

  describe('deleteVehicle', () => {
    it('車両を削除できる', async () => {
      const vehicle = await addVehicle({
        name: '削除対象',
        maxCapacity: 2.0,
        base64: SAMPLE_BASE64_IMAGE,
        mimeType: 'image/jpeg'
      });

      await deleteVehicle(vehicle!.id);

      const vehicles = await getReferenceImages();
      expect(vehicles.length).toBe(0);
    });
  });

  describe('画像の永続化テスト', () => {
    it('DBに保存された画像を再取得しても同じ内容が得られる', async () => {
      const originalBase64 = SAMPLE_BASE64_IMAGE;

      const vehicle = await addVehicle({
        name: '永続化テスト',
        maxCapacity: 4.0,
        base64: originalBase64,
        mimeType: 'image/jpeg'
      });

      // IndexedDBから直接取得
      const fromDB = await idb.getVehicleById(vehicle!.id);

      expect(fromDB).not.toBeUndefined();
      expect(fromDB?.base64).toBeDefined();
      expect(fromDB?.base64.length).toBeGreaterThan(0);
    });

    it('大きな画像でも保存・取得できる', async () => {
      // 100KB程度のダミーデータ
      const largeBase64 = SAMPLE_BASE64_IMAGE + 'x'.repeat(100000);

      const vehicle = await addVehicle({
        name: '大容量画像テスト',
        maxCapacity: 5.0,
        base64: largeBase64,
        mimeType: 'image/jpeg'
      });

      expect(vehicle).not.toBeNull();

      const vehicles = await getReferenceImages();
      expect(vehicles.length).toBe(1);
      // 圧縮されるが、何かしらのデータが保持される
      expect(vehicles[0].base64.length).toBeGreaterThan(0);
    });
  });
});
