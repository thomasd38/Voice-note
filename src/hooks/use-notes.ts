import { useCallback, useEffect, useRef, useState } from 'react';
import type { Note, NoteDraft } from '../types/note';
import type { RetentionDays } from '../types/settings';
import { StorageError } from '../db/indexed-db';
import * as repository from '../services/storage/notes-repository';

interface UseNotesOptions {
  retentionDays: RetentionDays;
  onError: (message: string) => void;
}

/**
 * Source de vérité des notes côté interface.
 *
 * Les notes sont chargées une fois puis maintenues en mémoire : les
 * transcriptions sont légères (l'audio, lui, reste dans IndexedDB et n'est lu
 * qu'au moment de la lecture). Le nettoyage des audios expirés est déclenché
 * au démarrage, comme demandé.
 */
export function useNotes({ retentionDays, onError }: UseNotesOptions) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const errorRef = useRef(onError);
  errorRef.current = onError;

  const report = useCallback((error: unknown, fallback: string) => {
    const message = error instanceof StorageError ? error.message : fallback;
    if (error instanceof StorageError && error.kind === 'unavailable') {
      setStorageAvailable(false);
    }
    errorRef.current(message);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const loaded = await repository.listNotes();
      setNotes(loaded);
      setStorageAvailable(true);
      return loaded;
    } catch (error) {
      report(error, "Impossible de charger vos notes.");
      return [];
    }
  }, [report]);

  // Démarrage : nettoyage des audios expirés PUIS chargement de la liste.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await repository.purgeExpiredAudio();
      } catch (error) {
        report(error, "Le nettoyage des audios expirés a échoué.");
      }
      if (cancelled) return;
      await refresh();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh, report]);

  const createNote = useCallback(
    async (draft: NoteDraft): Promise<Note | null> => {
      try {
        const note = await repository.createNote(draft, retentionDays);
        setNotes((current) => [note, ...current]);
        return note;
      } catch (error) {
        report(error, "La note n'a pas pu être enregistrée.");
        return null;
      }
    },
    [retentionDays, report],
  );

  const patchNote = useCallback(
    async (id: string, patch: Partial<Omit<Note, 'id' | 'createdAt'>>) => {
      try {
        const updated = await repository.updateNote(id, patch);
        setNotes((current) => current.map((note) => (note.id === id ? updated : note)));
        return updated;
      } catch (error) {
        report(error, "La note n'a pas pu être mise à jour.");
        return null;
      }
    },
    [report],
  );

  const saveTranscription = useCallback(
    async (id: string, transcription: string) => {
      try {
        const updated = await repository.updateTranscription(id, transcription);
        setNotes((current) => current.map((note) => (note.id === id ? updated : note)));
        return updated;
      } catch (error) {
        report(error, "La modification n'a pas pu être enregistrée.");
        return null;
      }
    },
    [report],
  );

  const deleteNote = useCallback(
    async (id: string) => {
      try {
        await repository.deleteNote(id);
        setNotes((current) => current.filter((note) => note.id !== id));
        return true;
      } catch (error) {
        report(error, "La note n'a pas pu être supprimée.");
        return false;
      }
    },
    [report],
  );

  const loadAudioUrl = useCallback(
    async (id: string): Promise<string | null> => {
      try {
        const blob = await repository.getAudioBlob(id);
        if (!blob) return null;
        return URL.createObjectURL(blob);
      } catch (error) {
        report(error, "L'audio de cette note n'a pas pu être chargé.");
        return null;
      }
    },
    [report],
  );

  const purgeExpired = useCallback(async () => {
    try {
      const result = await repository.purgeExpiredAudio();
      if (result.removed > 0) await refresh();
      return result;
    } catch (error) {
      report(error, "Le nettoyage des audios a échoué.");
      return { removed: 0, freedBytes: 0 };
    }
  }, [refresh, report]);

  const applyRetention = useCallback(
    async (days: RetentionDays) => {
      try {
        await repository.applyRetention(days);
        await repository.purgeExpiredAudio();
        await refresh();
      } catch (error) {
        report(error, "La durée de conservation n'a pas pu être appliquée.");
      }
    },
    [refresh, report],
  );

  return {
    notes,
    loading,
    storageAvailable,
    refresh,
    createNote,
    patchNote,
    saveTranscription,
    deleteNote,
    loadAudioUrl,
    purgeExpired,
    applyRetention,
  };
}

export type NotesApi = ReturnType<typeof useNotes>;
