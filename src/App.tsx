import { useCallback, useMemo, useRef, useState } from 'react';
import { ConfirmDialog } from './components/ConfirmDialog';
import { Modal } from './components/Modal';
import { SettingsPanel } from './components/SettingsPanel';
import { Toaster } from './components/Toaster';
import { useDevice } from './hooks/use-device';
import { SHORTCUTS, useKeyboardShortcuts } from './hooks/use-keyboard-shortcuts';
import { useNotes } from './hooks/use-notes';
import { useSettings } from './hooks/use-settings';
import { useToasts } from './hooks/use-toasts';
import { useVoiceRecorder } from './hooks/use-voice-recorder';
import { DesktopLayout } from './layouts/DesktopLayout';
import { MobileLayout } from './layouts/MobileLayout';
import type { FilterKey, LayoutProps } from './layouts/layout-props';
import type { Note } from './types/note';
import type { Settings } from './types/settings';
import { groupKeyFor } from './utils/format';
import { matchesQuery } from './utils/text';

/**
 * Point d'assemblage : état d'interface + branchement des services.
 *
 * Toute la logique métier vit dans les hooks (`use-notes`, `use-voice-recorder`)
 * et les services. `App` choisit seulement quelle expérience afficher — mobile
 * ou desktop — et leur passe exactement les mêmes données.
 */
export function App() {
  const { toasts, dismiss, push, showError, showInfo, showSuccess } = useToasts();
  const { settings, updateSettings } = useSettings();
  const notesApi = useNotes({ retentionDays: settings.audioRetentionDays, onError: showError });
  const device = useDevice();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Note | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleNoteCreated = useCallback(
    (note: Note) => {
      // Sur mobile, on ne veut pas ouvrir la note en plein écran : elle apparaît
      // simplement en haut de la liste. Sur desktop, le panneau de détail est
      // déjà visible, autant l'y afficher.
      if (device !== 'mobile') setSelectedId(note.id);
      if (note.transcriptionStatus === 'error' && note.transcriptionError) {
        showInfo(note.transcriptionError);
      }
    },
    [device, showInfo],
  );

  const recorder = useVoiceRecorder({
    settings,
    createNote: notesApi.createNote,
    onNoteCreated: handleNoteCreated,
    onError: showError,
    onInfo: showInfo,
  });

  const filteredNotes = useMemo(() => {
    const now = Date.now();
    return notesApi.notes.filter((note) => {
      if (filter === 'audio' && !note.hasAudio) return false;
      if (filter === 'today' && groupKeyFor(note.createdAt, now) !== 'today') return false;
      if (filter === 'week') {
        const group = groupKeyFor(note.createdAt, now);
        if (group === 'older') return false;
      }
      if (query && !matchesQuery(`${note.title} ${note.transcription}`, query)) return false;
      return true;
    });
  }, [filter, notesApi.notes, query]);

  const selectedNote = useMemo(
    () => notesApi.notes.find((note) => note.id === selectedId) ?? null,
    [notesApi.notes, selectedId],
  );

  const handleSelect = useCallback((note: Note | null) => {
    setSelectedId(note?.id ?? null);
  }, []);

  const handleSettingsChange = useCallback(
    (patch: Partial<Settings>) => {
      updateSettings(patch);
      if (
        patch.audioRetentionDays !== undefined &&
        patch.audioRetentionDays !== settings.audioRetentionDays
      ) {
        // Le nouveau délai s'applique aussi aux notes déjà enregistrées.
        void notesApi.applyRetention(patch.audioRetentionDays);
      }
    },
    [notesApi, settings.audioRetentionDays, updateSettings],
  );

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    const note = pendingDelete;
    setPendingDelete(null);
    const ok = await notesApi.deleteNote(note.id);
    if (ok) {
      if (selectedId === note.id) setSelectedId(null);
      showSuccess('Note supprimée.');
    }
  }, [notesApi, pendingDelete, selectedId, showSuccess]);

  const moveSelection = useCallback(
    (delta: number) => {
      if (filteredNotes.length === 0) return;
      const index = filteredNotes.findIndex((note) => note.id === selectedId);
      const next =
        index === -1
          ? delta > 0
            ? 0
            : filteredNotes.length - 1
          : Math.min(Math.max(index + delta, 0), filteredNotes.length - 1);
      setSelectedId(filteredNotes[next]?.id ?? null);
    },
    [filteredNotes, selectedId],
  );

  const overlayOpen = settingsOpen || shortcutsOpen || pendingDelete !== null;

  useKeyboardShortcuts({
    enabled: !overlayOpen,
    onToggleRecord: recorder.toggle,
    onCancelRecord: () => {
      if (recorder.status === 'recording') recorder.cancel();
    },
    onFocusSearch: () => searchInputRef.current?.focus(),
    onMoveSelection: moveSelection,
    onDeleteSelected: () => {
      if (selectedNote) setPendingDelete(selectedNote);
    },
    onCloseOverlay: () => {
      if (query) setQuery('');
      else if (device === 'mobile') setSelectedId(null);
    },
    onShowShortcuts: () => setShortcutsOpen(true),
  });

  const notices = (
    <>
      {!notesApi.storageAvailable && (
        <p className="notice notice--error" role="alert">
          Le stockage local est indisponible dans ce navigateur : vos notes ne pourront pas être
          conservées. Vérifiez les autorisations du site ou quittez la navigation privée.
        </p>
      )}
      {!recorder.recordingSupported && (
        <p className="notice notice--error" role="alert">
          Ce navigateur ne permet pas d'enregistrer de l'audio. Essayez Chrome, Edge, Firefox ou
          Safari en HTTPS.
        </p>
      )}
      {recorder.recordingSupported && !recorder.speechSupported && settings.autoTranscribe && (
        <p className="notice" role="status">
          La transcription automatique n'est pas disponible dans ce navigateur. L'enregistrement
          audio fonctionne normalement : vous pourrez écrire le texte de la note vous-même.
        </p>
      )}
      {recorder.permissionDenied && (
        <p className="notice notice--error" role="alert">
          L'accès au microphone est nécessaire pour enregistrer une note vocale. Autorisez le
          microphone dans les réglages de votre navigateur, puis réessayez.
        </p>
      )}
    </>
  );

  const layoutProps: LayoutProps = {
    notes: filteredNotes,
    totalCount: notesApi.notes.length,
    loading: notesApi.loading,
    query,
    onQueryChange: setQuery,
    filter,
    onFilterChange: setFilter,
    selectedNote,
    onSelectNote: handleSelect,
    recorder,
    settings,
    onOpenSettings: () => setSettingsOpen(true),
    onDeleteRequest: setPendingDelete,
    onSaveTranscription: notesApi.saveTranscription,
    loadAudioUrl: notesApi.loadAudioUrl,
    searchInputRef,
    notices,
  };

  return (
    <>
      {device === 'mobile' ? (
        <MobileLayout {...layoutProps} />
      ) : (
        <DesktopLayout
          {...layoutProps}
          density={device === 'tablet' ? 'tablet' : 'desktop'}
          onShowShortcuts={() => setShortcutsOpen(true)}
        />
      )}

      {settingsOpen && (
        <SettingsPanel
          settings={settings}
          onChange={handleSettingsChange}
          onClose={() => setSettingsOpen(false)}
          onPurgeExpired={notesApi.purgeExpired}
          onNotify={(message, tone) => push(message, tone ?? 'info')}
          speechSupported={recorder.speechSupported}
          speechProviderName={recorder.speechProviderName}
          variant={device === 'mobile' ? 'mobile' : 'desktop'}
        />
      )}

      {shortcutsOpen && (
        <Modal title="Raccourcis clavier" onClose={() => setShortcutsOpen(false)}>
          <ul className="shortcuts">
            {SHORTCUTS.map((shortcut) => (
              <li key={shortcut.keys}>
                <kbd>{shortcut.keys}</kbd>
                <span>{shortcut.description}</span>
              </li>
            ))}
          </ul>
        </Modal>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Supprimer cette note ?"
          message={`« ${pendingDelete.title || 'Note vocale'} » sera supprimée définitivement, ainsi que son audio. Cette action est irréversible.`}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      <Toaster toasts={toasts} onDismiss={dismiss} />
    </>
  );
}
