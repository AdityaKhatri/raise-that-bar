// Keep legacy name to preserve existing user data across the rename
export const DB_NAME = 'iron-log';
export const DB_VERSION = 3;

let dbPromise: Promise<IDBDatabase> | null = null;

function createStores(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains('exercises')) {
    const exStore = db.createObjectStore('exercises', { keyPath: 'id' });
    exStore.createIndex('muscleGroup', 'muscleGroup');
    exStore.createIndex('category', 'category');
    exStore.createIndex('archived', 'archived');
  }
  if (!db.objectStoreNames.contains('workouts')) {
    db.createObjectStore('workouts', { keyPath: 'id' });
  }
  if (!db.objectStoreNames.contains('plan')) {
    const planStore = db.createObjectStore('plan', { keyPath: 'date' });
    planStore.createIndex('date', 'date');
  }
  if (!db.objectStoreNames.contains('sessions')) {
    const sessStore = db.createObjectStore('sessions', { keyPath: 'id' });
    sessStore.createIndex('date', 'date');
  }
  if (!db.objectStoreNames.contains('bodyweight')) {
    db.createObjectStore('bodyweight', { keyPath: 'date' });
  }
  if (!db.objectStoreNames.contains('meta')) {
    db.createObjectStore('meta', { keyPath: 'key' });
  }
  // v3 stores
  if (!db.objectStoreNames.contains('profile')) {
    db.createObjectStore('profile', { keyPath: 'id' });
  }
  if (!db.objectStoreNames.contains('nutritionLog')) {
    const nlStore = db.createObjectStore('nutritionLog', { keyPath: 'id' });
    nlStore.createIndex('date', 'date');
  }
  if (!db.objectStoreNames.contains('calorieGoalLog')) {
    const cgStore = db.createObjectStore('calorieGoalLog', { keyPath: 'id' });
    cgStore.createIndex('date', 'date');
  }
}

export function getDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e: IDBVersionChangeEvent) => {
        const db = (e.target as IDBOpenDBRequest).result;
        createStores(db);
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        reject(req.error);
      };
    });
  }
  return dbPromise;
}

// ─── Private IDB helpers ──────────────────────────────────────────────────────

export function idbGet<T>(db: IDBDatabase, store: string, key: IDBValidKey): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

export function idbGetAll<T>(db: IDBDatabase, store: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

export function idbGetByIndex<T>(
  db: IDBDatabase,
  store: string,
  indexName: string,
  key: IDBValidKey
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const req = db
      .transaction(store, 'readonly')
      .objectStore(store)
      .index(indexName)
      .getAll(key);
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

export function idbPut<T>(db: IDBDatabase, store: string, value: T): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readwrite').objectStore(store).put(value);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export function idbDelete(db: IDBDatabase, store: string, key: IDBValidKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readwrite').objectStore(store).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** Bulk put many records in a single transaction */
export function idbPutMany<T>(db: IDBDatabase, store: string, values: T[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const st = tx.objectStore(store);
    values.forEach(v => st.put(v));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
