import { EmptyState } from '../components/EmptyState';
import { MicIcon, SettingsIcon } from '../components/Icons';
import { NoteDetail } from '../components/NoteDetail';
import { NoteList } from '../components/NoteList';
import { ProcessingCard } from '../components/ProcessingCard';
import { RecordButton } from '../components/RecordButton';
import { SearchBar } from '../components/SearchBar';
import type { LayoutProps } from './layout-props';

/**
 * 📱 Expérience mobile.
 *
 * Pensée pour le pouce : une seule colonne, un gros bouton circulaire ancré en
 * bas de l'écran (zone naturellement atteignable d'une main), et la note
 * ouverte en plein écran plutôt qu'en panneau. Rien d'autre à l'écran.
 */
export function MobileLayout({
  notes,
  totalCount,
  loading,
  query,
  onQueryChange,
  selectedNote,
  onSelectNote,
  recorder,
  settings,
  onOpenSettings,
  onDeleteRequest,
  onSaveTranscription,
  loadAudioUrl,
  searchInputRef,
  notices,
}: LayoutProps) {
  const isRecording = recorder.status === 'recording';
  const isProcessing = recorder.status === 'processing';

  return (
    <div className="app app--mobile">
      <header className="mobile-header">
        <h1 className="mobile-header__title">
          <span aria-hidden="true">🎙️</span> Voice Notes
        </h1>
        <button type="button" className="icon-button" onClick={onOpenSettings} aria-label="Paramètres">
          <SettingsIcon size={22} />
        </button>
      </header>

      {totalCount > 0 && (
        <div className="mobile-search">
          <SearchBar
            ref={searchInputRef}
            value={query}
            onChange={onQueryChange}
            resultCount={notes.length}
          />
        </div>
      )}

      <main className="mobile-main">
        {notices}
        {loading ? (
          <p className="loading-text">Chargement de vos notes…</p>
        ) : (
          <>
            {isProcessing && <ProcessingCard liveTranscript={recorder.liveTranscript} />}

            {notes.length === 0 && !isProcessing ? (
              totalCount === 0 ? (
                <EmptyState
                  icon={<MicIcon size={40} />}
                  title="Aucune note"
                  message="Appuyez sur le microphone pour créer votre première note."
                />
              ) : (
                <EmptyState
                  title="Aucun résultat"
                  message={`Aucune note ne contient « ${query} ».`}
                />
              )
            ) : (
              <NoteList
                notes={notes}
                selectedId={selectedNote?.id ?? null}
                query={query}
                variant="mobile"
                onSelect={onSelectNote}
                loadAudioUrl={loadAudioUrl}
              />
            )}

            {totalCount > 0 && (
              <p className="privacy-note">
                🔒 Vos notes sont stockées localement dans ce navigateur.
              </p>
            )}
          </>
        )}
      </main>

      <footer className="mobile-record" data-recording={isRecording}>
        {isRecording && (
          <p className="live-transcript" aria-live="polite">
            {recorder.liveTranscript || 'Parlez, je vous écoute…'}
          </p>
        )}
        <RecordButton
          status={recorder.status}
          elapsed={recorder.elapsed}
          mode={settings.recordingMode}
          variant="mobile"
          disabled={!recorder.recordingSupported}
          onStart={() => void recorder.start()}
          onStop={() => void recorder.stop()}
        />
        {isRecording && (
          <button type="button" className="button button--ghost mobile-record__cancel" onClick={recorder.cancel}>
            Annuler
          </button>
        )}
      </footer>

      {selectedNote && (
        <div className="mobile-detail" role="region" aria-label="Note sélectionnée">
          <NoteDetail
            note={selectedNote}
            variant="mobile"
            onClose={() => onSelectNote(null)}
            onDelete={onDeleteRequest}
            onSaveTranscription={onSaveTranscription}
            loadAudioUrl={loadAudioUrl}
          />
        </div>
      )}
    </div>
  );
}
