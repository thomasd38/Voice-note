/**
 * Environnement de test.
 *
 * `fake-indexeddb` fournit une vraie implémentation d'IndexedDB en mémoire :
 * les tests de stockage exercent donc le même code que le navigateur, sans le
 * remplacer par un mock maison.
 */
import 'fake-indexeddb/auto';
import { afterEach } from 'vitest';
import { closeDatabase, DB_NAME } from '../db/indexed-db';

afterEach(async () => {
  closeDatabase();
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
  localStorage.clear();
});
