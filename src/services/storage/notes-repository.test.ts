import { describe, expect, it } from 'vitest';
import {
  applyRetention,
  computeExpiry,
  createNote,
  deleteAudio,
  deleteNote,
  exportNotesAsJson,
  getAudio,
  getAudioBlob,
  getNote,
  getStorageStats,
  listNotes,
  purgeExpiredAudio,
  updateTranscription,
} from './notes-repository';

const DAY = 24 * 60 * 60 * 1000;

function audioBlob(content = 'audio-data'): Blob {
  return new Blob([content], { type: 'audio/webm' });
}

describe('createNote', () => {
  it("enregistre la note et l'audio, et dérive un titre", async () => {
    const note = await createNote(
      {
        audioBlob: audioBlob(),
        mimeType: 'audio/webm',
        duration: 5.2,
        transcription: "Penser à acheter une nouvelle raquette de padel. Et des balles.",
        transcriptionStatus: 'completed',
      },
      7,
    );

    expect(note.title).toBe('Penser à acheter une nouvelle raquette de padel');
    expect(note.hasAudio).toBe(true);
    expect(note.audioDuration).toBe(5.2);
    expect(note.audioSize).toBeGreaterThan(0);

    const stored = await getNote(note.id);
    expect(stored?.transcription).toContain('padel');

    const audio = await getAudio(note.id);
    expect(audio?.size).toBe(audioBlob().size);
    expect(audio?.mimeType).toBe('audio/webm');
    expect(audio?.expiresAt).toBe(note.createdAt + 7 * DAY);
    // Les octets sont conservés tels quels.
    expect(new TextDecoder().decode(audio?.data)).toBe('audio-data');

    // Et le Blob est reconstruit avec son type MIME pour la lecture.
    const restored = await getAudioBlob(note.id);
    expect(restored).toBeInstanceOf(Blob);
    expect(restored?.size).toBe(audioBlob().size);
    expect(restored?.type).toBe('audio/webm');
  });

  it('crée une note sans audio quand aucun blob n\'est fourni', async () => {
    const note = await createNote({ transcription: 'Texte seul', transcriptionStatus: 'completed' }, 7);
    expect(note.hasAudio).toBe(false);
    expect(note.audioExpiresAt).toBeUndefined();
    expect(await getAudio(note.id)).toBeUndefined();
    expect(await getAudioBlob(note.id)).toBeNull();
  });

  it('accepte une transcription vide en statut erreur (audio conservé)', async () => {
    const note = await createNote(
      {
        audioBlob: audioBlob(),
        transcriptionStatus: 'error',
        transcriptionError: "Aucune parole n'a été détectée.",
      },
      7,
    );

    expect(note.transcription).toBe('');
    expect(note.title).toBe('');
    expect(note.hasAudio).toBe(true);
    expect(note.transcriptionError).toBeTruthy();
  });

  it('applique une conservation illimitée quand le réglage vaut « Toujours »', async () => {
    const note = await createNote({ audioBlob: audioBlob(), transcriptionStatus: 'completed' }, 0);
    expect(note.audioExpiresAt).toBeNull();
    expect((await getAudio(note.id))?.expiresAt).toBeNull();
  });
});

describe('listNotes', () => {
  it('renvoie les notes les plus récentes en premier', async () => {
    const older = await createNote({ transcription: 'Ancienne', transcriptionStatus: 'completed' }, 7, 1_000);
    const newer = await createNote({ transcription: 'Récente', transcriptionStatus: 'completed' }, 7, 2_000);

    const notes = await listNotes();
    expect(notes.map((note) => note.id)).toEqual([newer.id, older.id]);
  });
});

describe('updateTranscription', () => {
  it('sauvegarde la correction, met à jour le titre et marque la note comme modifiée', async () => {
    const note = await createNote(
      { transcription: 'Il faut acheter des balle de padel.', transcriptionStatus: 'completed' },
      7,
    );

    const updated = await updateTranscription(note.id, 'Il faut acheter des balles de padel.');

    expect(updated.transcription).toBe('Il faut acheter des balles de padel.');
    expect(updated.title).toBe('Il faut acheter des balles de padel');
    expect(updated.edited).toBe(true);
    expect(updated.transcriptionStatus).toBe('completed');
    expect((await getNote(note.id))?.transcription).toBe('Il faut acheter des balles de padel.');
  });

  it('passe en erreur si la transcription est vidée', async () => {
    const note = await createNote({ transcription: 'Quelque chose', transcriptionStatus: 'completed' }, 7);
    const updated = await updateTranscription(note.id, '   ');
    expect(updated.transcriptionStatus).toBe('error');
    expect(updated.transcription).toBe('');
  });
});

describe('deleteNote', () => {
  it("supprime la note ET son audio", async () => {
    const note = await createNote({ audioBlob: audioBlob(), transcriptionStatus: 'completed' }, 7);

    await deleteNote(note.id);

    expect(await getNote(note.id)).toBeUndefined();
    expect(await getAudio(note.id)).toBeUndefined();
    expect(await listNotes()).toHaveLength(0);
  });
});

describe('expiration des audios', () => {
  it('supprime les audios expirés, conserve la note et sa transcription', async () => {
    const now = Date.now();
    const expired = await createNote(
      { audioBlob: audioBlob(), transcription: 'Note expirée', transcriptionStatus: 'completed' },
      7,
      now - 8 * DAY,
    );
    const fresh = await createNote(
      { audioBlob: audioBlob(), transcription: 'Note récente', transcriptionStatus: 'completed' },
      7,
      now - 1 * DAY,
    );

    const result = await purgeExpiredAudio(now);

    expect(result.removed).toBe(1);
    expect(result.freedBytes).toBeGreaterThan(0);

    const expiredNote = await getNote(expired.id);
    expect(expiredNote?.hasAudio).toBe(false);
    expect(expiredNote?.transcription).toBe('Note expirée');
    expect(expiredNote?.audioDeletedAt).toBeDefined();
    expect(await getAudio(expired.id)).toBeUndefined();

    const freshNote = await getNote(fresh.id);
    expect(freshNote?.hasAudio).toBe(true);
    expect(await getAudio(fresh.id)).toBeDefined();
  });

  it('ne touche jamais aux audios en conservation illimitée', async () => {
    const note = await createNote({ audioBlob: audioBlob(), transcriptionStatus: 'completed' }, 0, 1_000);

    const result = await purgeExpiredAudio(Date.now() + 1000 * DAY);

    expect(result.removed).toBe(0);
    expect((await getNote(note.id))?.hasAudio).toBe(true);
  });

  it('recalcule les expirations quand la durée de conservation change', async () => {
    const createdAt = Date.now() - 3 * DAY;
    const note = await createNote({ audioBlob: audioBlob(), transcriptionStatus: 'completed' }, 7, createdAt);
    expect((await getNote(note.id))?.audioExpiresAt).toBe(createdAt + 7 * DAY);

    await applyRetention(1);

    expect((await getNote(note.id))?.audioExpiresAt).toBe(createdAt + DAY);
    // L'audio est désormais expiré : le nettoyage suivant doit le supprimer.
    expect((await purgeExpiredAudio()).removed).toBe(1);
  });

  it('supprime un audio à la demande sans supprimer la note', async () => {
    const note = await createNote(
      { audioBlob: audioBlob(), transcription: 'Contenu', transcriptionStatus: 'completed' },
      7,
    );

    await deleteAudio(note.id);

    const updated = await getNote(note.id);
    expect(updated?.hasAudio).toBe(false);
    expect(updated?.transcription).toBe('Contenu');
  });
});

describe('computeExpiry', () => {
  it('rend null pour une conservation illimitée', () => {
    expect(computeExpiry(1_000, 0)).toBeNull();
    expect(computeExpiry(1_000, 7)).toBe(1_000 + 7 * DAY);
    expect(computeExpiry(1_000, 30)).toBe(1_000 + 30 * DAY);
  });
});

describe('getStorageStats', () => {
  it('compte les notes, les audios et estime la place occupée', async () => {
    await createNote({ audioBlob: audioBlob('12345'), transcriptionStatus: 'completed' }, 7);
    await createNote({ transcription: 'Sans audio', transcriptionStatus: 'completed' }, 7);
    await createNote({ audioBlob: audioBlob('123'), transcriptionStatus: 'completed' }, 7, Date.now() - 30 * DAY);

    const stats = await getStorageStats();

    expect(stats.noteCount).toBe(3);
    expect(stats.audioCount).toBe(2);
    expect(stats.audioBytes).toBe(8);
    expect(stats.expiredAudioCount).toBe(1);
  });
});

describe('exportNotesAsJson', () => {
  it('exporte les transcriptions et les métadonnées, sans les blobs', async () => {
    await createNote(
      { audioBlob: audioBlob(), transcription: 'À exporter', transcriptionStatus: 'completed', duration: 3 },
      7,
    );

    const parsed = JSON.parse(await exportNotesAsJson());

    expect(parsed.app).toBe('voice-notes');
    expect(parsed.noteCount).toBe(1);
    expect(parsed.notes[0].transcription).toBe('À exporter');
    expect(parsed.notes[0].audio).toMatchObject({ available: true, duration: 3 });
    expect(JSON.stringify(parsed)).not.toContain('blob');
  });
});
