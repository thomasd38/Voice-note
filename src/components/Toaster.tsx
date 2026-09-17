import type { Toast } from '../hooks/use-toasts';
import { CloseIcon } from './Icons';

interface ToasterProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

const PREFIX: Record<Toast['tone'], string> = {
  info: 'Information',
  error: 'Erreur',
  success: 'Succès',
};

/** Messages temporaires. Le ton est doublé par un libellé : pas que la couleur. */
export function Toaster({ toasts, onDismiss }: ToasterProps) {
  if (toasts.length === 0) return null;
  return (
    <div className="toaster" role="region" aria-label="Notifications">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="toast"
          data-tone={toast.tone}
          role={toast.tone === 'error' ? 'alert' : 'status'}
        >
          <span className="toast__label">{PREFIX[toast.tone]}</span>
          <p className="toast__message">{toast.message}</p>
          <button
            type="button"
            className="toast__close"
            onClick={() => onDismiss(toast.id)}
            aria-label="Masquer ce message"
          >
            <CloseIcon size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
