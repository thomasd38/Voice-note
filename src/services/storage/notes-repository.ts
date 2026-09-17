/**
 * Accès aux notes et aux audios.
 *
 * C'est la seule couche qui parle à IndexedDB : les composants et les hooks ne
 * manipulent que des `Note`. Le jour où un backend arrive (V2/V3), c'est ce
 * module qui change, pas l'interface.
 */

import {
  AUDIO_STORE,
  NOTES_STORE,
  idb,
  runTransaction,
  toStorageError,
} from '../../db/indexed-db';
import type { AudioRecord, Note, NoteDraft } from '../../types/note';
import type { RetentionDays } from '../../types/settings';
import { blobToArrayBuffer } from '../../utils/blob';
import { createId } from '../../utils/id';
import { deriveTitle } from '../../utils/text';

const DAY_MS = 24 * 60 * 60 * 1000;

/** `null` signifie « conservation illimitée ». */
export function computeExpiry(
  createdAt: number,
  retentionDays: RetentionDays,
): number | null {
  if (!retentionDays) return null;
  return createdAt + retentionDays * DAY_MS;
}

export async function listNotes(): Promise<Note[]> {
  const notes = await runTransaction(NOTES_STORE, 'readonly', (stores) =>
    idb.getAll<Note>(stores[NOTES_STORE]),
  );
  return notes.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getNote(id: string): Promise<Note | undefined> {
  return runTransaction(NOTES_STORE, 'readonly', (stores) =>
    idb.get<Note>(stores[NOTES_STORE], id),
  );
}

/**
 * Crée une note et, si un audio est fourni, l'enregistre dans le même
 * mouvement : l'audio est persisté avant même que la transcription démarre,
 * conformément au scénario (« sauvegarder immédiatement l'audio »).
 */
export async function createNote(
  draft: NoteDraft,
  retentionDays: RetentionDays,
  now: number = Date.now(),
): Promise<Note> {
  const id = createId();
  const transcription = draft.transcription?.trim() ?? '';
  const expiresAt = draft.audioBlob ? computeExpiry(now, retentionDays) : undefined;

  // La lecture du Blob se fait AVANT d'ouvrir la transaction : attendre une
  // promesse non-IndexedDB à l'intérieur d'une transaction la ferait expirer.
  const audioData = draft.audioBlob ? await blobToArrayBuffer(draft.audioBlob) : undefined;

  const note: Note = {
    id,
    createdAt: now,
    updatedAt: now,
    title: deriveTitle(transcription),
    transcription,
    transcriptionStatus: draft.transcriptionStatus,
    hasAudio: Boolean(draft.audioBlob),
  };
  if (draft.transcriptionError) note.transcriptionError = draft.transcriptionError;
  if (draft.transcriptionProvider) note.transcriptionProvider = draft.transcriptionProvider;
  if (draft.language) note.language = draft.language;
  if (draft.audioBlob) {
    note.audioMimeType = draft.mimeType ?? draft.audioBlob.type ?? 'audio/webm';
    note.audioDuration = draft.duration;
    note.audioSize = draft.audioBlob.size;
    note.audioExpiresAt = expiresAt ?? null;
  }

  await runTransaction([NOTES_STORE, AUDIO_STORE], 'readwrite', async (stores) => {
    await idb.put(stores[NOTES_STORE], note);
    if (audioData) {
      const audio: AudioRecord = {
        noteId: id,
        data: audioData,
        mimeType: note.audioMimeType ?? 'audio/webm',
        createdAt: now,
        size: audioData.byteLength,
        expiresAt: expiresAt ?? null,
      };
      await idb.put(stores[AUDIO_STORE], audio);
    }
  });

  return note;
}

/** Met à jour une note existante ; `updatedAt` est géré ici. */
export async function updateNote(
  id: string,
  patch: Partial<Omit<Note, 'id' | 'createdAt'>>,
  now: number = Date.now(),
): Promise<Note> {
  return runTransaction(NOTES_STORE, 'readwrite', async (stores) => {
    const store = stores[NOTES_STORE];
    const existing = await idb.get<Note>(store, id);
    if (!existing) throw toStorageError(new Error(`Note introuvable : ${id}`));
    const updated: Note = { ...existing, ...patch, id, createdAt: existing.createdAt, updatedAt: now };
    await idb.put(store, updated);
    return updated;
  });
}

/** Modification manuelle de la transcription : le titre suit automatiquement. */
export async function updateTranscription(
  id: string,
  transcription: string,
  now: number = Date.now(),
): Promise<Note> {
  const text = transcription.trim();
  return updateNote(
    id,
    {
      transcription: text,
      title: deriveTitle(text),
      transcriptionStatus: text ? 'completed' : 'error',
      transcriptionError: text ? undefined : 'Transcription vide.',
      edited: true,
    },
    now,
  );
}

export async function deleteNote(id: string): Promise<void> {
  await runTransaction([NOTES_STORE, AUDIO_STORE], 'readwrite', async (stores) => {
    await idb.delete(stores[NOTES_STORE], id);
    await idb.delete(stores[AUDIO_STORE], id);
  });
}

export async function getAudio(noteId: string): Promise<AudioRecord | undefined> {
  return runTransaction(AUDIO_STORE, 'readonly', (stores) =>
    idb.get<AudioRecord>(stores[AUDIO_STORE], noteId),
  );
}

/** Reconstruit le Blob lisible par un élément `<audio>`. */
export async function getAudioBlob(noteId: string): Promise<Blob | null> {
  const record = await getAudio(noteId);
  if (!record?.data) return null;
  return new Blob([record.data], { type: record.mimeType || 'audio/webm' });
}

/** Supprime uniquement l'audio : la note et sa transcription sont conservées. */
export async function deleteAudio(noteId: string, now: number = Date.now()): Promise<void> {
  await runTransaction([NOTES_STORE, AUDIO_STORE], 'readwrite', async (stores) => {
    await idb.delete(stores[AUDIO_STORE], noteId);
    const note = await idb.get<Note>(stores[NOTES_STORE], noteId);
    if (note?.hasAudio) {
      await idb.put(stores[NOTES_STORE], { ...note, hasAudio: false, audioDeletedAt: now });
    }
  });
}

export interface PurgeResult {
  /** Nombre d'audios supprimés. */
  removed: number;
  /** Octets libérés (somme des tailles supprimées). */
  freedBytes: number;
}

/**
 * Supprime les audios arrivés à expiration. Appelé au démarrage de
 * l'application et depuis les paramètres.
 */
export async function purgeExpiredAudio(now: number = Date.now()): Promise<PurgeResult> {
  return runTransaction([NOTES_STORE, AUDIO_STORE], 'readwrite', async (stores) => {
    const audioStore = stores[AUDIO_STORE];
    const notesStore = stores[NOTES_STORE];
    // `expiresAt: null` n'est pas indexable : les audios « conservation
    // illimitée » sont donc naturellement exclus de cette requête.
    const expired = await idb.getAll<AudioRecord>(
      audioStore.index('expiresAt'),
      IDBKeyRange.upperBound(now),
    );

    let freedBytes = 0;
    for (const record of expired) {
      freedBytes += record.size ?? record.data?.byteLength ?? 0;
      await idb.delete(audioStore, record.noteId);
      const note = await idb.get<Note>(notesStore, record.noteId);
      if (note) {
        await idb.put(notesStore, { ...note, hasAudio: false, audioDeletedAt: now });
      }
    }

    return { removed: expired.length, freedBytes };
  });
}

/**
 * Réapplique une durée de conservation à toutes les notes existantes
 * (l'utilisateur vient de changer le réglage). Les audios déjà expirés au
 * regard de la nouvelle durée seront supprimés au prochain nettoyage.
 */
export async function applyRetention(retentionDays: RetentionDays): Promise<void> {
  await runTransaction([NOTES_STORE, AUDIO_STORE], 'readwrite', async (stores) => {
    const audioStore = stores[AUDIO_STORE];
    const notesStore = stores[NOTES_STORE];
    const records = await idb.getAll<AudioRecord>(audioStore);
    for (const record of records) {
      const expiresAt = computeExpiry(record.createdAt, retentionDays);
      await idb.put(audioStore, { ...record, expiresAt });
      const note = await idb.get<Note>(notesStore, record.noteId);
      if (note) await idb.put(notesStore, { ...note, audioExpiresAt: expiresAt });
    }
  });
}

export interface StorageStats {
  noteCount: number;
  audioCount: number;
  audioBytes: number;
  /** Nombre d'audios déjà expirés mais pas encore nettoyés. */
  expiredAudioCount: number;
  /** Estimation navigateur (`navigator.storage.estimate()`), si disponible. */
  quotaUsage?: number;
  quotaTotal?: number;
}

export async function getStorageStats(now: number = Date.now()): Promise<StorageStats> {
  const stats = await runTransaction([NOTES_STORE, AUDIO_STORE], 'readonly', async (stores) => {
    const noteCount = await idb.count(stores[NOTES_STORE]);
    const records = await idb.getAll<AudioRecord>(stores[AUDIO_STORE]);
    const audioBytes = records.reduce((total, record) => total + (record.size ?? 0), 0);
    const expiredAudioCount = records.filter(
      (record) => record.expiresAt !== null && record.expiresAt <= now,
    ).length;
    return { noteCount, audioCount: records.length, audioBytes, expiredAudioCount };
  });

  // L'estimation du navigateur est indicative : on ne l'affiche que si elle existe.
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (estimate) {
      return { ...stats, quotaUsage: estimate.usage, quotaTotal: estimate.quota };
    }
  } catch {
    /* estimate() peut être refusée : ce n'est pas une erreur bloquante */
  }
  return stats;
}

/** Export JSON des métadonnées et transcriptions (l'audio reste local). */
export async function exportNotesAsJson(): Promise<string> {
  const notes = await listNotes();
  return JSON.stringify(
    {
      app: 'voice-notes',
      version: 1,
      exportedAt: new Date().toISOString(),
      noteCount: notes.length,
      // L'audio n'est pas inclus dans la V1 : le format prévoit déjà le champ
      // `audio` pour pouvoir y ajouter du base64 plus tard sans casser les
      // imports existants.
      notes: notes.map((note) => ({
        id: note.id,
        createdAt: new Date(note.createdAt).toISOString(),
        updatedAt: new Date(note.updatedAt).toISOString(),
        title: note.title,
        transcription: note.transcription,
        transcriptionStatus: note.transcriptionStatus,
        language: note.language ?? null,
        audio: note.hasAudio
          ? {
              available: true,
              mimeType: note.audioMimeType ?? null,
              duration: note.audioDuration ?? null,
              sizeBytes: note.audioSize ?? null,
              expiresAt: note.audioExpiresAt ? new Date(note.audioExpiresAt).toISOString() : null,
            }
          : { available: false },
      })),
    },
    null,
    2,
  );
}
