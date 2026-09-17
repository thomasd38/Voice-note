import { memo, useMemo } from 'react';
import type { Note } from '../types/note';
import { formatDuration, formatNoteDate } from '../utils/format';
import { highlightSegments, normalizeForSearch } from '../utils/text';
import { AudioPlayer } from './AudioPlayer';
import { PlayIcon, TrashIcon } from './Icons';

interface NoteCardProps {
  note: Note;
  selected: boolean;
  query: string;
  variant: 'mobile' | 'desktop';
  onSelect: (note: Note) => void;
  onDelete?: (note: Note) => void;
  loadAudioUrl: (noteId: string) => Promise<string | null>;
}

/** Aperçu de la transcription, avec mise en évidence des termes recherchés. */
function Preview({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  return (
    <>
      {highlightSegments(text, query).map((segment, index) =>
        segment.match ? (
          <mark key={index}>{segment.text}</mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}

function NoteCardComponent({
  note,
  selected,
  query,
  variant,
  onSelect,
  onDelete,
  loadAudioUrl,
}: NoteCardProps) {
  const title = note.title || (note.hasAudio ? 'Note vocale' : 'Note sans titre');

  // Le titre étant la première phrase de la transcription, l'aperçu n'affiche
  // que la SUITE du texte : sans cela, les notes d'une seule phrase
  // s'afficheraient deux fois à l'identique.
  const excerpt = useMemo(() => {
    const text = note.transcription.trim();
    // Un titre tronqué coupe au milieu d'une phrase : afficher « la suite »
    // donnerait un fragment illisible, on montre alors tout le texte.
    if (!text || !note.title || note.title.endsWith('…')) return text;
    if (!normalizeForSearch(text).startsWith(normalizeForSearch(note.title))) return text;
    return text.slice(note.title.length).replace(/^[\s.!?…,;:]+/, '');
  }, [note.title, note.transcription]);

  return (
    <article
      className="note-card"
      data-selected={selected}
      data-variant={variant}
      aria-current={selected ? 'true' : undefined}
    >
      <button
        type="button"
        className="note-card__main"
        onClick={() => onSelect(note)}
        aria-label={`Ouvrir la note : ${title}`}
      >
        <h3 className="note-card__title">
          <Preview text={title} query={query} />
        </h3>

        {note.transcriptionStatus === 'pending' ? (
          <p className="note-card__excerpt">
            <span className="note-card__pending">Transcription en cours…</span>
          </p>
        ) : excerpt ? (
          <p className="note-card__excerpt">
            <Preview text={excerpt} query={query} />
          </p>
        ) : (
          // Rien à ajouter : soit le titre contient déjà toute la transcription,
          // soit il n'y a pas de texte du tout — et on le dit alors clairement.
          !note.transcription && (
            <p className="note-card__excerpt">
              <span className="note-card__muted">
                {note.transcriptionStatus === 'unavailable'
                  ? 'Transcription automatique indisponible'
                  : 'Pas de transcription'}
              </span>
            </p>
          )
        )}

        <footer className="note-card__meta">
          <time dateTime={new Date(note.createdAt).toISOString()}>
            {formatNoteDate(note.createdAt)}
          </time>
          {/* Sur desktop la carte porte déjà un lecteur avec sa durée :
              inutile de répéter l'information dans la ligne de métadonnées. */}
          {note.hasAudio ? (
            variant === 'mobile' && (
              <span className="note-card__badge">
                <PlayIcon size={12} />
                {formatDuration(note.audioDuration)}
              </span>
            )
          ) : (
            note.audioSize !== undefined && (
              <span className="note-card__badge note-card__badge--muted">Audio expiré</span>
            )
          )}
          {note.edited && <span className="note-card__badge note-card__badge--muted">Modifiée</span>}
        </footer>
      </button>

      {variant === 'desktop' && note.hasAudio && (
        <div className="note-card__player">
          <AudioPlayer
            noteId={note.id}
            duration={note.audioDuration}
            variant="compact"
            loadAudioUrl={loadAudioUrl}
          />
        </div>
      )}

      {onDelete && (
        <button
          type="button"
          className="note-card__delete"
          onClick={() => onDelete(note)}
          aria-label={`Supprimer la note : ${title}`}
          title="Supprimer"
        >
          <TrashIcon size={16} />
        </button>
      )}
    </article>
  );
}

export const NoteCard = memo(NoteCardComponent);
