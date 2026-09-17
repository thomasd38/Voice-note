/**
 * Petite abstraction IndexedDB (≈150 lignes, sans dépendance).
 *
 * Dexie ferait le même travail, mais nos besoins tiennent en deux object stores
 * et quelques requêtes par index : l'API native suffit largement et le projet
 * reste léger (cf. règle « une dépendance = une justification »).
 *
 * Toutes les erreurs techniques sont converties en `StorageError`, avec un
 * message déjà rédigé pour l'utilisateur : l'interface n'a jamais à afficher un
 * `DOMException: QuotaExceededError` brut.
 */

export const DB_NAME = 'voice-notes';
export const DB_VERSION = 1;

export const NOTES_STORE = 'notes';
export const AUDIO_STORE = 'audio';

export type StorageErrorKind = 'unavailable' | 'quota' | 'unknown';

export class StorageError extends Error {
  readonly kind: StorageErrorKind;
  readonly cause?: unknown;

  constructor(kind: StorageErrorKind, message: string, cause?: unknown) {
    super(message);
    this.name = 'StorageError';
    this.kind = kind;
    this.cause = cause;
  }
}

const MESSAGES: Record<StorageErrorKind, string> = {
  unavailable:
    "Le stockage local n'est pas disponible dans ce navigateur. Vos notes ne peuvent pas être enregistrées (navigation privée ?).",
  quota:
    "L'espace de stockage du navigateur est plein. Supprimez d'anciennes notes ou nettoyez les audios expirés.",
  unknown: "Une erreur est survenue lors de l'accès aux données enregistrées.",
};

export function toStorageError(error: unknown): StorageError {
  if (error instanceof StorageError) return error;
  const name = (error as { name?: string } | null)?.name;
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') {
    return new StorageError('quota', MESSAGES.quota, error);
  }
  if (name === 'InvalidStateError' || name === 'SecurityError') {
    return new StorageError('unavailable', MESSAGES.unavailable, error);
  }
  return new StorageError('unknown', MESSAGES.unknown, error);
}

export function isIndexedDbSupported(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDatabase(): Promise<IDBDatabase> {
  if (!isIndexedDbSupported()) {
    return Promise.reject(new StorageError('unavailable', MESSAGES.unavailable));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      reject(toStorageError(error));
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(NOTES_STORE)) {
        const notes = db.createObjectStore(NOTES_STORE, { keyPath: 'id' });
        notes.createIndex('createdAt', 'createdAt');
        notes.createIndex('updatedAt', 'updatedAt');
      }
      if (!db.objectStoreNames.contains(AUDIO_STORE)) {
        const audio = db.createObjectStore(AUDIO_STORE, { keyPath: 'noteId' });
        // Index utilisé par le nettoyage des audios expirés.
        audio.createIndex('expiresAt', 'expiresAt');
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      // Si un autre onglet demande une mise à jour de schéma, on libère la
      // connexion pour ne pas bloquer l'autre onglet.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };

    request.onerror = () => reject(toStorageError(request.error));
    request.onblocked = () =>
      reject(
        new StorageError(
          'unavailable',
          "Un autre onglet de Voice Notes bloque la mise à jour du stockage. Fermez-le puis rechargez la page.",
        ),
      );
  }).catch((error) => {
    dbPromise = null;
    throw toStorageError(error);
  });

  return dbPromise;
}

/** Ferme la connexion courante (utilisé par les tests). */
export function closeDatabase(): void {
  const pending = dbPromise;
  dbPromise = null;
  void pending?.then((db) => db.close()).catch(() => undefined);
}

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(toStorageError(request.error));
  });
}

/**
 * Exécute une opération dans une transaction et ne résout qu'une fois celle-ci
 * réellement validée (`oncomplete`), pour éviter de croire qu'une écriture est
 * persistée alors que la transaction a été annulée (quota, par exemple).
 */
export async function runTransaction<T>(
  storeNames: string | string[],
  mode: IDBTransactionMode,
  operation: (stores: Record<string, IDBObjectStore>) => Promise<T> | T,
): Promise<T> {
  const db = await openDatabase();
  const names = Array.isArray(storeNames) ? storeNames : [storeNames];

  return new Promise<T>((resolve, reject) => {
    let transaction: IDBTransaction;
    try {
      transaction = db.transaction(names, mode);
    } catch (error) {
      reject(toStorageError(error));
      return;
    }

    const stores: Record<string, IDBObjectStore> = {};
    for (const name of names) stores[name] = transaction.objectStore(name);

    let result: T;
    let settled = false;

    transaction.oncomplete = () => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };
    transaction.onerror = () => {
      if (!settled) {
        settled = true;
        reject(toStorageError(transaction.error));
      }
    };
    transaction.onabort = () => {
      if (!settled) {
        settled = true;
        reject(toStorageError(transaction.error));
      }
    };

    Promise.resolve()
      .then(() => operation(stores))
      .then((value) => {
        result = value;
      })
      .catch((error) => {
        settled = true;
        try {
          transaction.abort();
        } catch {
          /* la transaction est peut-être déjà terminée */
        }
        reject(toStorageError(error));
      });
  });
}

export const idb = {
  get: <T>(store: IDBObjectStore, key: IDBValidKey) =>
    promisifyRequest<T | undefined>(store.get(key) as IDBRequest<T | undefined>),
  getAll: <T>(source: IDBObjectStore | IDBIndex, query?: IDBKeyRange) =>
    promisifyRequest<T[]>(source.getAll(query) as IDBRequest<T[]>),
  getAllKeys: (source: IDBObjectStore | IDBIndex, query?: IDBKeyRange) =>
    promisifyRequest<IDBValidKey[]>(source.getAllKeys(query)),
  put: (store: IDBObjectStore, value: unknown) => promisifyRequest(store.put(value as never)),
  delete: (store: IDBObjectStore, key: IDBValidKey) => promisifyRequest(store.delete(key)),
  count: (source: IDBObjectStore | IDBIndex, query?: IDBKeyRange) =>
    promisifyRequest<number>(source.count(query)),
  clear: (store: IDBObjectStore) => promisifyRequest(store.clear()),
};
