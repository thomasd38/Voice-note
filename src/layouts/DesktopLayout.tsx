import { EmptyState } from '../components/EmptyState';
import { MicIcon, NoteIcon, SettingsIcon } from '../components/Icons';
import { NoteDetail } from '../components/NoteDetail';
import { NoteList } from '../components/NoteList';
import { ProcessingCard } from '../components/ProcessingCard';
import { RecordButton } from '../components/RecordButton';
import { SearchBar } from '../components/SearchBar';
import { FILTERS, type LayoutProps } from './layout-props';

interface DesktopLayoutProps extends LayoutProps {
  /** `tablet` replie la barre latérale en une rangée de filtres. */
  density: 'tablet' | 'desktop';
  onShowShortcuts: () => void;
}

/**
 * 💻 Expérience desktop (et tablette).
 *
 * Trois panneaux visibles en même temps — filtres, liste, note — pour exploiter
 * la largeur : on lit une note sans perdre la liste de vue. Le clavier est
 * traité comme une entrée de premier plan (voir `useKeyboardShortcuts`) et
 * chaque carte affiche plus d'informations que sur mobile, dont son lecteur
 * audio directement dans la liste.
 */
export function DesktopLayout({
  notes,
  totalCount,
  loading,
  query,
  onQueryChange,
  filter,
  onFilterChange,
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
  density,
  onShowShortcuts,
}: DesktopLayoutProps) {
  const isRecording = recorder.status === 'recording';
  const isProcessing = recorder.status === 'processing';

  const filterChips = (
    <nav className="filters" aria-label="Filtrer les notes">
      {FILTERS.map((item) => (
        <button
          key={item.key}
          type="button"
          className="filters__item"
          data-active={filter === item.key}
          aria-pressed={filter === item.key}
          onClick={() => onFilterChange(item.key)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );

  return (
    <div className="app app--desktop" data-density={density}>
      {density === 'desktop' && (
        <aside className="sidebar">
          <div className="sidebar__brand">
            <span aria-hidden="true">🎙️</span>
            <span>Voice Notes</span>
          </div>

          {filterChips}

          <div className="sidebar__spacer" />

          <div className="sidebar__footer">
            <p className="privacy-note">🔒 Vos notes sont stockées localement dans ce navigateur.</p>
            <button type="button" className="button button--ghost" onClick={onShowShortcuts}>
              Raccourcis clavier
            </button>
            <button type="button" className="button button--ghost" onClick={onOpenSettings}>
              <SettingsIcon size={16} /> Paramètres
            </button>
          </div>
        </aside>
      )}

      <section className="list-column" aria-label="Liste des notes">
        <header className="list-column__header">
          <SearchBar
            ref={searchInputRef}
            value={query}
            onChange={onQueryChange}
            resultCount={notes.length}
            shortcutHint="/"
          />
          {density === 'tablet' && (
            <div className="list-column__tablet-actions">
              {filterChips}
              <button
                type="button"
                className="icon-button"
                onClick={onOpenSettings}
                aria-label="Paramètres"
              >
                <SettingsIcon size={20} />
              </button>
            </div>
          )}
        </header>

        <div className="list-column__scroll">
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
                    message="Appuyez sur le microphone (ou la touche R) pour créer votre première note."
                  />
                ) : (
                  <EmptyState
                    title="Aucun résultat"
                    message={
                      query
                        ? `Aucune note ne contient « ${query} ».`
                        : 'Aucune note dans ce filtre.'
                    }
                  />
                )
              ) : (
                <NoteList
                  notes={notes}
                  selectedId={selectedNote?.id ?? null}
                  query={query}
                  variant="desktop"
                  onSelect={onSelectNote}
                  onDelete={onDeleteRequest}
                  loadAudioUrl={loadAudioUrl}
                />
              )}
            </>
          )}
        </div>

        <footer className="list-column__record" data-recording={isRecording}>
          {isRecording && (
            <p className="live-transcript" aria-live="polite">
              {recorder.liveTranscript || 'Parlez, je vous écoute…'}
            </p>
          )}
          <RecordButton
            status={recorder.status}
            elapsed={recorder.elapsed}
            mode={settings.recordingMode}
            variant="desktop"
            disabled={!recorder.recordingSupported}
            onStart={() => void recorder.start()}
            onStop={() => void recorder.stop()}
          />
          {isRecording ? (
            <button type="button" className="button button--ghost" onClick={recorder.cancel}>
              Annuler (Échap)
            </button>
          ) : (
            <p className="list-column__record-hint">
              <kbd>R</kbd> pour enregistrer · <kbd>/</kbd> pour rechercher
            </p>
          )}
        </footer>
      </section>

      <section className="detail-column" aria-label="Note sélectionnée">
        {selectedNote ? (
          <NoteDetail
            note={selectedNote}
            variant="desktop"
            onDelete={onDeleteRequest}
            onSaveTranscription={onSaveTranscription}
            loadAudioUrl={loadAudioUrl}
          />
        ) : (
          <EmptyState
            icon={<NoteIcon size={36} />}
            title="Aucune note sélectionnée"
            message="Choisissez une note dans la liste, ou utilisez ↑ / ↓ pour naviguer au clavier."
          />
        )}
      </section>
    </div>
  );
}
