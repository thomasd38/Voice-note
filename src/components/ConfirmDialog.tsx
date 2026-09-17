import { Modal } from './Modal';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmation explicite avant toute action destructive (suppression). */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Supprimer',
  cancelLabel = 'Annuler',
  danger = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="confirm__message">{message}</p>
      <div className="confirm__actions">
        <button type="button" className="button button--ghost" onClick={onCancel}>
          {cancelLabel}
        </button>
        <button
          type="button"
          className={`button ${danger ? 'button--danger' : 'button--primary'}`}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
