import { useCallback, useState } from 'react';
import type { Settings } from '../types/settings';
import { loadSettings, saveSettings } from '../services/storage/settings-store';

/** Préférences utilisateur, persistées à chaque modification. */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  return { settings, updateSettings };
}
