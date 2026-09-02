import type { ChudikSpec } from '../creatures/ChudikSpec';

/**
 * The zoo lives on the device. A creature a child made must still be there
 * tomorrow, with no network involved.
 */

const DB_NAME = 'chudiki-zoo';
const DB_VERSION = 1;
const CREATURES = 'creatures';
const VOICES = 'voices';

export type StoredCreature = {
  spec: ChudikSpec;
  /** Position the creature was last seen at, so the zoo feels continuous. */
  lastPosition?: { x: number; z: number };
};

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(CREATURES)) {
          db.createObjectStore(CREATURES, { keyPath: 'spec.id' });
        }
        if (!db.objectStoreNames.contains(VOICES)) {
          db.createObjectStore(VOICES);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

function transact<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const request = run(tx.objectStore(store));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
}

export async function loadCreatures(): Promise<StoredCreature[]> {
  try {
    const all = await transact<StoredCreature[]>(CREATURES, 'readonly', (s) => s.getAll());
    return all.sort((a, b) => a.spec.createdAt - b.spec.createdAt);
  } catch (error) {
    console.warn('[zoo] could not read saved creatures', error);
    return [];
  }
}

export async function saveCreature(record: StoredCreature): Promise<void> {
  await transact(CREATURES, 'readwrite', (s) => s.put(record));
}

export async function deleteCreature(id: string): Promise<void> {
  await transact(CREATURES, 'readwrite', (s) => s.delete(id));
  await transact(VOICES, 'readwrite', (s) => s.delete(id));
}

/** Recorded voices are stored as raw bytes next to the creature. */
export async function saveVoiceRecording(id: string, bytes: ArrayBuffer, mimeType: string): Promise<void> {
  await transact(VOICES, 'readwrite', (s) => s.put({ bytes, mimeType }, id));
}

export async function loadVoiceRecording(
  id: string,
): Promise<{ bytes: ArrayBuffer; mimeType: string } | null> {
  try {
    const value = await transact<{ bytes: ArrayBuffer; mimeType: string } | undefined>(
      VOICES,
      'readonly',
      (s) => s.get(id),
    );
    return value ?? null;
  } catch {
    return null;
  }
}

export async function listVoiceIds(): Promise<string[]> {
  try {
    const keys = await transact<IDBValidKey[]>(VOICES, 'readonly', (s) => s.getAllKeys());
    return keys.map(String);
  } catch {
    return [];
  }
}

export async function deleteVoiceRecording(id: string): Promise<void> {
  await transact(VOICES, 'readwrite', (s) => s.delete(id));
}
