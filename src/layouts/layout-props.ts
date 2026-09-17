import type { ReactNode, RefObject } from 'react';
import type { Note } from '../types/note';
import type { Settings } from '../types/settings';
import type { VoiceRecorderApi } from '../hooks/use-voice-recorder';

/** Filtres rapides proposés sur les grands écrans. */
export type FilterKey = 'all' | 'today' | 'week' | 'audio';

export const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Toutes' },
  { key: 'today', label: "Aujourd'hui" },
  { key: 'week', label: 'Cette semaine' },
  { key: 'audio', label: 'Avec audio' },
];

/**
 * Props partagées par les deux expériences.
 *
 * Les layouts mobile et desktop reçoivent exactement les mêmes données et les
 * mêmes actions : toute la logique métier vit dans les hooks et les services.
 * Seule la mise en scène diffère.
 */
export interface LayoutProps {
  notes: Note[];
  totalCount: number;
  loading: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  filter: FilterKey;
  onFilterChange: (filter: FilterKey) => void;
  selectedNote: Note | null;
  onSelectNote: (note: Note | null) => void;
  recorder: VoiceRecorderApi;
  settings: Settings;
  onOpenSettings: () => void;
  onDeleteRequest: (note: Note) => void;
  onSaveTranscription: (id: string, transcription: string) => Promise<unknown>;
  loadAudioUrl: (noteId: string) => Promise<string | null>;
  searchInputRef: RefObject<HTMLInputElement>;
  /** Bandeaux d'information persistants (stockage indisponible, STT absent…). */
  notices?: ReactNode;
}
