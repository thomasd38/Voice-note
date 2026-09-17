/** Préférences utilisateur (petites valeurs : stockées dans localStorage). */

export type RecordingMode = 'toggle' | 'hold';

/** Durée de conservation de l'audio en jours. `0` = illimité. */
export type RetentionDays = 1 | 7 | 30 | 0;

export interface Settings {
  /** « 1 clic = démarrer / 1 clic = arrêter » par défaut. */
  recordingMode: RecordingMode;
  /** 7 jours par défaut. */
  audioRetentionDays: RetentionDays;
  /** Transcription automatique après l'enregistrement. */
  autoTranscribe: boolean;
  /** Langue BCP-47 utilisée par le moteur de reconnaissance vocale. */
  language: string;
  /** Identifiant du provider Speech-to-Text choisi. */
  speechProviderId: string;
}

export const DEFAULT_SETTINGS: Settings = {
  recordingMode: 'toggle',
  audioRetentionDays: 7,
  autoTranscribe: true,
  language: 'fr-FR',
  speechProviderId: 'web-speech',
};

export const RETENTION_OPTIONS: { value: RetentionDays; label: string }[] = [
  { value: 1, label: '1 jour' },
  { value: 7, label: '7 jours' },
  { value: 30, label: '30 jours' },
  { value: 0, label: 'Toujours' },
];

export const LANGUAGE_OPTIONS: { value: string; label: string }[] = [
  { value: 'fr-FR', label: 'Français (France)' },
  { value: 'fr-CA', label: 'Français (Canada)' },
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'es-ES', label: 'Español' },
  { value: 'de-DE', label: 'Deutsch' },
  { value: 'it-IT', label: 'Italiano' },
  { value: 'pt-PT', label: 'Português' },
];
