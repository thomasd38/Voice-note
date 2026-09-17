import { useEffect, useRef } from 'react';

interface ShortcutHandlers {
  /** Désactivé quand une boîte de dialogue est ouverte. */
  enabled: boolean;
  onToggleRecord: () => void;
  onCancelRecord: () => void;
  onFocusSearch: () => void;
  onMoveSelection: (delta: number) => void;
  onDeleteSelected: () => void;
  onCloseOverlay: () => void;
  onShowShortcuts: () => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/**
 * Raccourcis clavier (expérience desktop).
 *
 * Ils ne se déclenchent jamais pendant la saisie de texte, sauf Échap qui doit
 * toujours permettre de sortir d'un champ ou d'annuler un enregistrement.
 */
export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const current = ref.current;
      if (!current.enabled) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const typing = isTypingTarget(event.target);

      if (event.key === 'Escape') {
        event.preventDefault();
        current.onCancelRecord();
        current.onCloseOverlay();
        if (typing && event.target instanceof HTMLElement) event.target.blur();
        return;
      }

      if (typing) return;

      switch (event.key) {
        case '/':
          event.preventDefault();
          current.onFocusSearch();
          break;
        case 'r':
        case 'R':
          event.preventDefault();
          current.onToggleRecord();
          break;
        case 'ArrowDown':
          event.preventDefault();
          current.onMoveSelection(1);
          break;
        case 'ArrowUp':
          event.preventDefault();
          current.onMoveSelection(-1);
          break;
        case 'Delete':
        case 'Backspace':
          event.preventDefault();
          current.onDeleteSelected();
          break;
        case '?':
          event.preventDefault();
          current.onShowShortcuts();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

export const SHORTCUTS: { keys: string; description: string }[] = [
  { keys: 'R', description: 'Démarrer / arrêter un enregistrement' },
  { keys: '/', description: 'Rechercher dans les notes' },
  { keys: '↑ ↓', description: 'Naviguer dans la liste' },
  { keys: 'Suppr', description: 'Supprimer la note sélectionnée' },
  { keys: 'Échap', description: 'Annuler un enregistrement / fermer un panneau' },
  { keys: '?', description: 'Afficher cette aide' },
];
