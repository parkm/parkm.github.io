/**
 * Tiny promise-based IndexedDB wrapper.
 *
 * We use raw IndexedDB (no dependency) because the data is small, the access
 * patterns are simple, and it keeps the demo self-contained. Everything the
 * rest of the app needs goes through this module so the storage layer can be
 * swapped or upgraded in one place.
 */

const DB_NAME = "counters-app";
const DB_VERSION = 1;

export type StoreName = "counters" | "history" | "stacks" | "meta";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("counters")) {
        db.createObjectStore("counters", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("stacks")) {
        db.createObjectStore("stacks", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("history")) {
        const history = db.createObjectStore("history", { keyPath: "id" });
        history.createIndex("counterId", "counterId", { unique: false });
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  return dbPromise;
}

function tx(
  db: IDBDatabase,
  store: StoreName,
  mode: IDBTransactionMode,
): IDBObjectStore {
  return db.transaction(store, mode).objectStore(store);
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDB();
  return promisify(tx(db, store, "readonly").getAll() as IDBRequest<T[]>);
}

export async function put<T>(store: StoreName, value: T): Promise<void> {
  const db = await openDB();
  await promisify(tx(db, store, "readwrite").put(value));
}

export async function del(store: StoreName, key: IDBValidKey): Promise<void> {
  const db = await openDB();
  await promisify(tx(db, store, "readwrite").delete(key));
}

/** Write many records of one store in a single transaction. */
export async function bulkPut<T>(store: StoreName, values: T[]): Promise<void> {
  if (values.length === 0) return;
  const db = await openDB();
  const objectStore = tx(db, store, "readwrite");
  await Promise.all(values.map((v) => promisify(objectStore.put(v))));
}

/** Delete every record across the given stores (used by import "replace"). */
export async function clearStores(stores: StoreName[]): Promise<void> {
  const db = await openDB();
  await Promise.all(
    stores.map((s) => promisify(tx(db, s, "readwrite").clear())),
  );
}

/** Delete all history entries for a counter (used when the counter is removed). */
export async function deleteHistoryForCounter(
  counterId: string,
): Promise<void> {
  const db = await openDB();
  const store = tx(db, "history", "readwrite");
  const index = store.index("counterId");
  const keys = await promisify(
    index.getAllKeys(IDBKeyRange.only(counterId)) as IDBRequest<IDBValidKey[]>,
  );
  await Promise.all(keys.map((k) => promisify(store.delete(k))));
}

/** Read a single meta value by key. */
export async function getMeta<T>(key: string): Promise<T | undefined> {
  const db = await openDB();
  const row = await promisify(
    tx(db, "meta", "readonly").get(key) as IDBRequest<
      { key: string; value: T } | undefined
    >,
  );
  return row?.value;
}

export async function setMeta<T>(key: string, value: T): Promise<void> {
  await put("meta", { key, value });
}

/**
 * Ask the browser to mark storage as persistent so it isn't silently evicted
 * under storage pressure. Returns the resulting persisted state, or null if the
 * API is unavailable. Best invoked from a user gesture for the friendliest
 * prompt, but safe to call any time.
 */
export async function requestPersistentStorage(): Promise<boolean | null> {
  if (!navigator.storage?.persist) return null;
  // If already persisted, don't re-prompt.
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

export async function isStoragePersisted(): Promise<boolean | null> {
  if (!navigator.storage?.persisted) return null;
  return navigator.storage.persisted();
}

/** Rough storage usage estimate for the stats panel. */
export async function storageEstimate(): Promise<StorageEstimate | null> {
  if (!navigator.storage?.estimate) return null;
  return navigator.storage.estimate();
}
