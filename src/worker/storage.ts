import type { SaveData, SaveMeta } from '../sim/save';

/** Speicherstände in IndexedDB (direkt im Worker – blockiert die Darstellung nie). */
const DB_NAME = 'iv4ever';
const STORE = 'saves';

interface SaveRecord {
  slot: string;
  meta: SaveMeta;
  data: SaveData;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'slot' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbPromise.catch(() => (dbPromise = null));
  }
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const tx = d.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error ?? req.error);
        tx.onabort = () => reject(tx.error ?? new Error('Transaktion abgebrochen'));
      }),
  );
}

export function putSave(meta: SaveMeta, data: SaveData): Promise<IDBValidKey> {
  return run('readwrite', (s) => s.put({ slot: meta.slot, meta, data } satisfies SaveRecord));
}

export async function getSave(slot: string): Promise<SaveData | null> {
  const rec = (await run('readonly', (s) => s.get(slot))) as SaveRecord | undefined;
  return rec ? rec.data : null;
}

export async function listSaves(): Promise<SaveMeta[]> {
  const all = (await run('readonly', (s) => s.getAll())) as SaveRecord[];
  return all.map((r) => r.meta).sort((a, b) => b.savedAt - a.savedAt);
}
