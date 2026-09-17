import { useCallback, useRef, useState } from 'react';
import { createId } from '../utils/id';

export type ToastTone = 'info' | 'error' | 'success';

export interface Toast {
  id: string;
  message: string;
  tone: ToastTone;
}

const DISPLAY_MS = 6000;

/** Messages éphémères (erreurs comprises), toujours rédigés pour l'utilisateur. */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, number>());

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const id = createId();
      // Deux messages au maximum : au-delà, ils masquent l'interface.
      setToasts((current) => [...current.slice(-1), { id, message, tone }]);
      const timer = window.setTimeout(() => dismiss(id), DISPLAY_MS);
      timers.current.set(id, timer);
      return id;
    },
    [dismiss],
  );

  const showError = useCallback((message: string) => push(message, 'error'), [push]);
  const showInfo = useCallback((message: string) => push(message, 'info'), [push]);
  const showSuccess = useCallback((message: string) => push(message, 'success'), [push]);

  return { toasts, push, dismiss, showError, showInfo, showSuccess };
}
