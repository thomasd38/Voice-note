/**
 * Contrat commun à tous les moteurs de transcription.
 *
 * L'application ne connaît QUE cette interface : elle n'importe jamais
 * `SpeechRecognition` directement. Ajouter un moteur (Whisper local, API
 * cloud…) revient à écrire une classe qui implémente `SpeechToTextProvider` et
 * à l'enregistrer dans `registry.ts`.
 */

export type SpeechErrorKind =
  | 'unsupported'
  | 'permission-denied'
  | 'no-speech'
  | 'network'
  | 'aborted'
  | 'language-unavailable'
  | 'unknown';

export class SpeechError extends Error {
  readonly kind: SpeechErrorKind;
  readonly cause?: unknown;

  constructor(kind: SpeechErrorKind, message: string, cause?: unknown) {
    super(message);
    this.name = 'SpeechError';
    this.kind = kind;
    this.cause = cause;
  }
}

export const SPEECH_ERROR_MESSAGES: Record<SpeechErrorKind, string> = {
  unsupported: "La transcription automatique n'est pas disponible dans ce navigateur.",
  'permission-denied':
    "L'accès au microphone a été refusé : la transcription automatique n'a pas pu démarrer.",
  'no-speech': "Aucune parole n'a été détectée dans cet enregistrement.",
  network:
    'La transcription a échoué : le moteur de reconnaissance vocale du navigateur est injoignable (connexion requise).',
  aborted: 'La transcription a été interrompue.',
  'language-unavailable': "La langue choisie n'est pas prise en charge par ce navigateur.",
  unknown: 'La transcription automatique a échoué.',
};

export function speechErrorMessage(kind: SpeechErrorKind): string {
  return SPEECH_ERROR_MESSAGES[kind];
}

/** Mise à jour de transcription : texte confirmé + hypothèse en cours. */
export interface TranscriptUpdate {
  /** Texte confirmé depuis le début de l'enregistrement. */
  final: string;
  /** Hypothèse provisoire, remplacée au fil de la parole. */
  interim: string;
}

export interface SpeechStartOptions {
  /** Code BCP-47, ex. `fr-FR`. */
  lang: string;
}

export type SpeechResultListener = (update: TranscriptUpdate) => void;
export type SpeechErrorListener = (error: SpeechError) => void;
export type Unsubscribe = () => void;

/**
 * `live`  : le moteur écoute le micro en direct (Web Speech API).
 * `batch` : le moteur transcrit un fichier déjà enregistré (Whisper, cloud…).
 *           Seuls les providers `batch` peuvent re-transcrire une note plus tard.
 */
export type SpeechProviderMode = 'live' | 'batch';

export interface SpeechToTextProvider {
  readonly id: string;
  readonly name: string;
  readonly mode: SpeechProviderMode;

  isSupported(): boolean;

  /** Démarre l'écoute (mode `live`). */
  start(options: SpeechStartOptions): Promise<void>;

  /** Arrête l'écoute et résout avec la transcription finale complète. */
  stop(): Promise<string>;

  /** Interrompt sans produire de résultat. */
  abort(): void;

  onResult(listener: SpeechResultListener): Unsubscribe;
  onError(listener: SpeechErrorListener): Unsubscribe;

  /**
   * Transcrit un audio déjà enregistré (mode `batch` uniquement).
   * Absent des providers `live` : c'est ce qui détermine si l'interface peut
   * proposer « Réessayer la transcription » sur une note existante.
   */
  transcribe?(blob: Blob, options: SpeechStartOptions): Promise<string>;
}
