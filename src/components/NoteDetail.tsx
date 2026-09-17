import { useEffect, useRef, useState } from 'react';
import type { Note } from '../types/note';
import { formatBytes, formatExpiry, formatFullDate } from '../utils/format';
import { AudioPlayer } from './AudioPlayer';
import { BackIcon, CheckIcon, CloseIcon, EditIcon, TrashIcon } from './Icons';

interface NoteDetailProps {
  note: Note;
  variant: 'mobile' | 'desktop';
  onSaveTranscription: (id: string, transcription: string) => Promise<unknown>;
  onDelete: (note: Note) => void;
  onClose?: () => void;
  loadAudioUrl: (noteId: string) => Promise<string | null>;
}

/** Vue détaillée : lecture, correction de la transcription et suppression. */
export function NoteDetail({
  note,
  variant,
  onSaveTranscription,
  onDelete,
  onClose,
  loadAudioUrl,
}: NoteDetailProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.transcription);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Changer de note annule une édition en cours plutôt que de la transposer.
  useEffect(() => {
    setEditing(false);
    setDraft(note.transcription);
  }, [note.id, note.transcription]);

  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  const save = async () => {
    setSaving(true);
    await onSaveTranscription(note.id, draft);
    setSaving(false);
    setEditing(false);
  };

  const title = note.title || (note.hasAudio ? 'Note vocale' : 'Note sans titre');

  return (
    <article className="note-detail" data-variant={variant}>
      <header className="note-detail__header">
        {onClose && (
          <button type="button" className="icon-button" onClick={onClose} aria-label="Retour à la liste">
            <BackIcon size={22} />
          </button>
        )}
        <div className="note-detail__heading">
          <h2 className="note-detail__title">{title}</h2>
          <p className="note-detail__date">
            <time dateTime={new Date(note.createdAt).toISOString()}>
              {formatFullDate(note.createdAt)}
            </time>
            {note.edited && <span className="note-detail__tag">modifiée</span>}
          </p>
        </div>
        <button
          type="button"
          className="icon-button icon-button--danger"
          onClick={() => onDelete(note)}
          aria-label="Supprimer cette note"
          title="Supprimer cette note"
        >
          <TrashIcon size={20} />
        </button>
      </header>

      <section className="note-detail__audio" aria-label="Enregistrement audio">
        {note.hasAudio ? (
          <>
            <AudioPlayer noteId={note.id} duration={note.audioDuration} loadAudioUrl={loadAudioUrl} />
            <p className="note-detail__audio-meta">
              Audio disponible
              {note.audioExpiresAt !== undefined && ` · ${formatExpiry(note.audioExpiresAt)}`}
              {note.audioSize ? ` · ${formatBytes(note.audioSize)}` : ''}
            </p>
          </>
        ) : (
          <p className="note-detail__audio-expired">
            <span aria-hidden="true">🕓</span> Audio expiré — la transcription reste disponible.
          </p>
        )}
      </section>

      <section className="note-detail__body" aria-label="Transcription">
        {note.transcriptionStatus === 'pending' && !editing && (
          <p className="note-detail__pending">Transcription en cours…</p>
        )}

        {note.transcriptionStatus === 'error' && !editing && (
          <p className="note-detail__error" role="status">
            {note.transcriptionError ?? 'La transcription a échoué.'}
          </p>
        )}

        {note.transcriptionStatus === 'unavailable' && !editing && (
          <p className="note-detail__notice" role="status">
            {note.transcriptionError ??
              "La transcription automatique n'est pas disponible dans ce navigateur."}
          </p>
        )}

        {editing ? (
          <div className="note-detail__editor">
            <label className="visually-hidden" htmlFor={`transcription-${note.id}`}>
              Transcription de la note
            </label>
            <textarea
              id={`transcription-${note.id}`}
              ref={textareaRef}
              className="note-detail__textarea"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.stopPropagation();
                  setDraft(note.transcription);
                  setEditing(false);
                }
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void save();
              }}
              rows={variant === 'mobile' ? 8 : 12}
              placeholder="Écrivez ou corrigez la transcription…"
            />
            <div className="note-detail__editor-actions">
              <button
                type="button"
                className="button button--ghost"
                onClick={() => {
                  setDraft(note.transcription);
                  setEditing(false);
                }}
              >
                <CloseIcon size={16} /> Annuler
              </button>
              <button type="button" className="button button--primary" onClick={() => void save()} disabled={saving}>
                <CheckIcon size={16} /> {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
            <p className="note-detail__hint">Astuce : Ctrl/⌘ + Entrée pour enregistrer.</p>
          </div>
        ) : (
          <>
            {note.transcription ? (
              <p className="note-detail__transcription">{note.transcription}</p>
            ) : (
              <p className="note-detail__empty-transcription">
                Cette note n'a pas encore de texte. Vous pouvez l'écrire vous-même.
              </p>
            )}
            <button type="button" className="button button--ghost" onClick={() => setEditing(true)}>
              <EditIcon size={16} /> Modifier la transcription
            </button>
          </>
        )}
      </section>
    </article>
  );
}
