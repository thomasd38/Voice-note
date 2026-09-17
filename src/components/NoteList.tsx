import { useMemo } from 'react';
import type { Note } from '../types/note';
import { GROUP_LABELS, groupKeyFor, type NoteGroupKey } from '../utils/format';
import { NoteCard } from './NoteCard';

interface NoteListProps {
  notes: Note[];
  selectedId: string | null;
  query: string;
  variant: 'mobile' | 'desktop';
  onSelect: (note: Note) => void;
  onDelete?: (note: Note) => void;
  loadAudioUrl: (noteId: string) => Promise<string | null>;
}

const ORDER: NoteGroupKey[] = ['today', 'yesterday', 'week', 'older'];

/** Liste groupée par période (Aujourd'hui / Hier / Cette semaine / Plus ancien). */
export function NoteList({
  notes,
  selectedId,
  query,
  variant,
  onSelect,
  onDelete,
  loadAudioUrl,
}: NoteListProps) {
  const groups = useMemo(() => {
    const now = Date.now();
    const map = new Map<NoteGroupKey, Note[]>();
    for (const note of notes) {
      const key = groupKeyFor(note.createdAt, now);
      const bucket = map.get(key);
      if (bucket) bucket.push(note);
      else map.set(key, [note]);
    }
    return ORDER.filter((key) => map.has(key)).map((key) => ({
      key,
      label: GROUP_LABELS[key],
      notes: map.get(key) ?? [],
    }));
  }, [notes]);

  return (
    <div className="note-list">
      {groups.map((group) => (
        <section key={group.key} className="note-list__group" aria-labelledby={`group-${group.key}`}>
          <h2 className="note-list__group-title" id={`group-${group.key}`}>
            {group.label}
            <span className="note-list__group-count">{group.notes.length}</span>
          </h2>
          <div className="note-list__items">
            {group.notes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                selected={note.id === selectedId}
                query={query}
                variant={variant}
                onSelect={onSelect}
                onDelete={onDelete}
                loadAudioUrl={loadAudioUrl}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
