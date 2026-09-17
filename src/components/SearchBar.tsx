import { forwardRef } from 'react';
import { CloseIcon, SearchIcon } from './Icons';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  resultCount?: number;
  placeholder?: string;
  /** Affiché sur desktop : rappel du raccourci clavier. */
  shortcutHint?: string;
}

/**
 * Recherche instantanée : le filtrage se fait en mémoire à chaque frappe, sans
 * debounce (quelques centaines de notes se filtrent en moins d'une milliseconde).
 */
export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(function SearchBar(
  { value, onChange, resultCount, placeholder = 'Rechercher dans mes notes…', shortcutHint },
  ref,
) {
  return (
    <div className="search-bar">
      <span className="search-bar__icon" aria-hidden="true">
        <SearchIcon size={18} />
      </span>
      <input
        ref={ref}
        type="search"
        className="search-bar__input"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        aria-label="Rechercher dans les transcriptions"
        autoComplete="off"
        spellCheck={false}
      />
      {value ? (
        <button
          type="button"
          className="search-bar__clear"
          onClick={() => onChange('')}
          aria-label="Effacer la recherche"
        >
          <CloseIcon size={16} />
        </button>
      ) : (
        shortcutHint && (
          <kbd className="search-bar__shortcut" aria-hidden="true">
            {shortcutHint}
          </kbd>
        )
      )}
      <p className="search-bar__status" role="status" aria-live="polite">
        {value
          ? `${resultCount ?? 0} note${(resultCount ?? 0) > 1 ? 's' : ''} trouvée${(resultCount ?? 0) > 1 ? 's' : ''}`
          : ''}
      </p>
    </div>
  );
});
