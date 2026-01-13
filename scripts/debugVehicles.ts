// ブラウザのコンソールで実行するデバッグ用コード
// F12 → Console で以下をコピペして実行

/*
(async () => {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('TonCheckerDB');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  const tx = db.transaction('vehicles', 'readonly');
  const store = tx.objectStore('vehicles');
  const vehicles = await new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  console.log('=== 登録車両一覧 ===');
  console.log('件数:', vehicles.length);

  vehicles.forEach((v, i) => {
    console.log(`--- 車両 ${i + 1} ---`);
    console.log('ID:', v.id);
    console.log('名前:', v.name);
    console.log('最大積載量:', v.maxCapacity, 't');
    console.log('MIMEタイプ:', v.mimeType);
    console.log('base64の長さ:', v.base64?.length || 0);
    console.log('base64の先頭100文字:', v.base64?.substring(0, 100) || '(空)');
  });

  return vehicles;
})();
*/

// 上記をブラウザコンソールで実行すると、IndexedDBに保存されている車両データを確認できます
