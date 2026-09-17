/**
 * Préférences utilisateur.
 *
 * Ce sont de petites valeurs scalaires : localStorage est ici le bon outil
 * (IndexedDB reste réservé aux notes et aux blobs audio). Toute valeur invalide
 * ou corrompue retombe silencieusement sur la valeur par défaut.
 */

import {
  DEFAULT_SETTINGS,
  RETENTION_OPTIONS,
  type RecordingMode,
  type RetentionDays,
  type Settings,
} from '../../types/settings';

const STORAGE_KEY = 'voice-notes:settings';

function safeLocalStorage(): Storage | null {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return null;
    // Safari en navigation privée expose localStorage mais refuse l'écriture.
    const probe = '__voice-notes-probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

function isRecordingMode(value: unknown): value is RecordingMode {
  return value === 'toggle' || value === 'hold';
}

function isRetention(value: unknown): value is RetentionDays {
  return RETENTION_OPTIONS.some((option) => option.value === value);
}

/** Valide un objet inconnu et complète les champs manquants. */
export function sanitizeSettings(raw: unknown): Settings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS };
  const value = raw as Partial<Settings>;
  return {
    recordingMode: isRecordingMode(value.recordingMode)
      ? value.recordingMode
      : DEFAULT_SETTINGS.recordingMode,
    audioRetentionDays: isRetention(value.audioRetentionDays)
      ? value.audioRetentionDays
      : DEFAULT_SETTINGS.audioRetentionDays,
    autoTranscribe:
      typeof value.autoTranscribe === 'boolean'
        ? value.autoTranscribe
        : DEFAULT_SETTINGS.autoTranscribe,
    language:
      typeof value.language === 'string' && value.language.trim()
        ? value.language
        : DEFAULT_SETTINGS.language,
    speechProviderId:
      typeof value.speechProviderId === 'string' && value.speechProviderId.trim()
        ? value.speechProviderId
        : DEFAULT_SETTINGS.speechProviderId,
  };
}

export function loadSettings(): Settings {
  const storage = safeLocalStorage();
  if (!storage) return { ...DEFAULT_SETTINGS };
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  const storage = safeLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(sanitizeSettings(settings)));
  } catch {
    /* Les préférences ne sont pas critiques : on ignore un échec d'écriture. */
  }
}

export function clearSettings(): void {
  safeLocalStorage()?.removeItem(STORAGE_KEY);
}
