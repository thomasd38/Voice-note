import { useCallback, useRef } from 'react';
import type { RecordingStatus } from '../hooks/use-voice-recorder';
import type { RecordingMode } from '../types/settings';
import { formatDuration } from '../utils/format';
import { MicIcon, StopIcon } from './Icons';

interface RecordButtonProps {
  status: RecordingStatus;
  elapsed: number;
  mode: RecordingMode;
  variant: 'mobile' | 'desktop';
  disabled?: boolean;
  onStart: () => void;
  onStop: () => void;
}

const LABELS: Record<RecordingStatus, string> = {
  idle: 'Nouvelle note',
  requesting: 'Microphone…',
  recording: 'Enregistrement…',
  processing: 'Traitement…',
};

/**
 * Bouton d'action principal.
 *
 * Deux comportements, choisis dans les paramètres :
 *  - `toggle` (défaut) : 1 clic démarre, 1 clic arrête ;
 *  - `hold` : on maintient le bouton (pointeur ou barre d'espace).
 *
 * L'état est signalé par l'icône, le libellé, le minuteur ET la couleur : la
 * couleur n'est jamais le seul indicateur.
 */
export function RecordButton({
  status,
  elapsed,
  mode,
  variant,
  disabled,
  onStart,
  onStop,
}: RecordButtonProps) {
  const holdingRef = useRef(false);
  const isRecording = status === 'recording';
  const isBusy = status === 'processing' || status === 'requesting';

  const handleClick = useCallback(() => {
    if (mode !== 'toggle' || isBusy) return;
    if (isRecording) onStop();
    else onStart();
  }, [isBusy, isRecording, mode, onStart, onStop]);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (mode !== 'hold' || isBusy) return;
      event.preventDefault();
      holdingRef.current = true;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      onStart();
    },
    [isBusy, mode, onStart],
  );

  const handlePointerUp = useCallback(() => {
    if (mode !== 'hold' || !holdingRef.current) return;
    holdingRef.current = false;
    onStop();
  }, [mode, onStop]);

  // En mode « maintenir », le clavier doit aussi fonctionner : Espace/Entrée
  // maintenus enregistrent, le relâchement arrête.
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (mode !== 'hold' || isBusy) return;
      if (event.key !== ' ' && event.key !== 'Enter') return;
      event.preventDefault();
      if (event.repeat || holdingRef.current) return;
      holdingRef.current = true;
      onStart();
    },
    [isBusy, mode, onStart],
  );

  const handleKeyUp = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (mode !== 'hold' || !holdingRef.current) return;
      if (event.key !== ' ' && event.key !== 'Enter') return;
      event.preventDefault();
      holdingRef.current = false;
      onStop();
    },
    [mode, onStop],
  );

  const ariaLabel = isRecording
    ? `Arrêter l'enregistrement (${formatDuration(elapsed)})`
    : mode === 'hold'
      ? 'Maintenir pour enregistrer une note vocale'
      : 'Démarrer un enregistrement';

  return (
    <div className={`record-zone record-zone--${variant}`}>
      <button
        type="button"
        className="record-button"
        data-status={status}
        data-variant={variant}
        aria-label={ariaLabel}
        aria-pressed={isRecording}
        disabled={disabled || isBusy}
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
      >
        <span className="record-button__pulse" aria-hidden="true" />
        <span className="record-button__icon">
          {isRecording ? <StopIcon size={variant === 'mobile' ? 30 : 24} /> : <MicIcon size={variant === 'mobile' ? 34 : 26} />}
        </span>
      </button>

      <div className="record-zone__label">
        <span className="record-zone__state" aria-live="polite">
          {LABELS[status]}
        </span>
        {isRecording ? (
          <span className="record-zone__timer" role="timer">
            {formatDuration(elapsed)}
          </span>
        ) : (
          mode === 'hold' &&
          status === 'idle' && <span className="record-zone__hint">Maintenez le bouton</span>
        )}
      </div>
    </div>
  );
}
