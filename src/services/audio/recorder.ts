/**
 * Enregistrement audio (MediaRecorder).
 *
 * Volontairement indépendant du Speech-to-Text : ce module ne sait produire
 * qu'un Blob et une durée. Le provider STT tourne en parallèle, de son côté
 * (cf. `services/speech-to-text`). C'est ce découplage qui permettra de
 * brancher Whisper plus tard sans toucher à l'enregistrement.
 */

export type RecorderState = 'idle' | 'requesting' | 'recording' | 'stopping';

export type RecorderErrorKind =
  | 'unsupported'
  | 'insecure-context'
  | 'permission-denied'
  | 'no-microphone'
  | 'microphone-busy'
  | 'too-short'
  | 'unknown';

export class RecorderError extends Error {
  readonly kind: RecorderErrorKind;
  readonly cause?: unknown;

  constructor(kind: RecorderErrorKind, message: string, cause?: unknown) {
    super(message);
    this.name = 'RecorderError';
    this.kind = kind;
    this.cause = cause;
  }
}

const ERROR_MESSAGES: Record<RecorderErrorKind, string> = {
  unsupported: "Ce navigateur ne permet pas d'enregistrer de l'audio (MediaRecorder indisponible).",
  'insecure-context':
    "L'enregistrement nécessite une connexion sécurisée (HTTPS). Ouvrez le site en HTTPS pour utiliser le microphone.",
  'permission-denied':
    "L'accès au microphone est nécessaire pour enregistrer une note vocale. Autorisez le microphone dans votre navigateur, puis réessayez.",
  'no-microphone': "Aucun microphone n'a été détecté sur cet appareil.",
  'microphone-busy':
    'Le microphone est déjà utilisé par une autre application ou un autre onglet. Fermez-la puis réessayez.',
  'too-short': "L'enregistrement était trop court. Maintenez l'enregistrement un instant avant de l'arrêter.",
  unknown: "L'enregistrement a échoué. Réessayez.",
};

export function recorderErrorMessage(kind: RecorderErrorKind): string {
  return ERROR_MESSAGES[kind];
}

export interface RecordingResult {
  blob: Blob;
  mimeType: string;
  /** Durée en secondes, mesurée pendant l'enregistrement. */
  duration: number;
}

/** Durée minimale considérée comme un enregistrement valide. */
export const MIN_RECORDING_MS = 350;

/** Formats testés dans l'ordre de préférence (Opus d'abord, Safari ensuite). */
const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
  'audio/mpeg',
];

type MediaRecorderCtor = typeof MediaRecorder;

export interface AudioRecorderOptions {
  /** Injectables pour les tests. */
  mediaDevices?: MediaDevices;
  recorderCtor?: MediaRecorderCtor;
  now?: () => number;
}

export function isRecordingSupported(options: AudioRecorderOptions = {}): boolean {
  const devices = options.mediaDevices ?? globalThis.navigator?.mediaDevices;
  const ctor = options.recorderCtor ?? globalThis.MediaRecorder;
  return Boolean(devices && typeof devices.getUserMedia === 'function' && ctor);
}

function pickMimeType(ctor: MediaRecorderCtor): string | undefined {
  if (typeof ctor.isTypeSupported !== 'function') return undefined;
  return PREFERRED_MIME_TYPES.find((type) => {
    try {
      return ctor.isTypeSupported(type);
    } catch {
      return false;
    }
  });
}

function mapUserMediaError(error: unknown): RecorderError {
  const name = (error as { name?: string } | null)?.name;
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return new RecorderError('permission-denied', ERROR_MESSAGES['permission-denied'], error);
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return new RecorderError('no-microphone', ERROR_MESSAGES['no-microphone'], error);
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return new RecorderError('microphone-busy', ERROR_MESSAGES['microphone-busy'], error);
    default:
      return new RecorderError('unknown', ERROR_MESSAGES.unknown, error);
  }
}

/**
 * Machine à états simple : `idle → requesting → recording → stopping → idle`.
 * Aucune dépendance à React : testable directement, réutilisable ailleurs.
 */
export class AudioRecorder {
  private state: RecorderState = 'idle';
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  /** `null` hors enregistrement : un horodatage peut légitimement valoir 0. */
  private startedAt: number | null = null;
  private stoppedAt = 0;
  private readonly listeners = new Set<(state: RecorderState) => void>();
  private readonly options: AudioRecorderOptions;

  constructor(options: AudioRecorderOptions = {}) {
    this.options = options;
  }

  private get now(): number {
    return (this.options.now ?? Date.now)();
  }

  getState(): RecorderState {
    return this.state;
  }

  /** Durée écoulée en secondes (0 hors enregistrement). */
  getElapsedSeconds(): number {
    if (this.state !== 'recording' || this.startedAt === null) return 0;
    return (this.now - this.startedAt) / 1000;
  }

  onStateChange(listener: (state: RecorderState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setState(state: RecorderState): void {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }

  /** Demande le micro puis démarre l'enregistrement. */
  async start(): Promise<void> {
    if (this.state !== 'idle') return;

    const devices = this.options.mediaDevices ?? globalThis.navigator?.mediaDevices;
    const ctor = this.options.recorderCtor ?? globalThis.MediaRecorder;

    if (!devices?.getUserMedia || !ctor) {
      // Un contexte non sécurisé est la cause la plus fréquente d'absence de
      // `mediaDevices` : on le signale explicitement, c'est plus actionnable.
      if (typeof globalThis.isSecureContext === 'boolean' && !globalThis.isSecureContext) {
        throw new RecorderError('insecure-context', ERROR_MESSAGES['insecure-context']);
      }
      throw new RecorderError('unsupported', ERROR_MESSAGES.unsupported);
    }

    this.setState('requesting');
    let stream: MediaStream;
    try {
      stream = await devices.getUserMedia({ audio: true });
    } catch (error) {
      this.setState('idle');
      throw mapUserMediaError(error);
    }

    try {
      const mimeType = pickMimeType(ctor);
      const recorder = mimeType ? new ctor(stream, { mimeType }) : new ctor(stream);
      this.chunks = [];
      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) this.chunks.push(event.data);
      };
      this.recorder = recorder;
      this.stream = stream;
      this.startedAt = this.now;
      this.stoppedAt = 0;
      recorder.start();
      this.setState('recording');
    } catch (error) {
      this.releaseStream(stream);
      this.setState('idle');
      throw new RecorderError('unknown', ERROR_MESSAGES.unknown, error);
    }
  }

  /**
   * Arrête l'enregistrement et renvoie le Blob produit.
   * Lève `RecorderError('too-short')` si l'utilisateur a arrêté immédiatement.
   */
  async stop(): Promise<RecordingResult> {
    const recorder = this.recorder;
    if (!recorder || this.state !== 'recording') {
      throw new RecorderError('unknown', ERROR_MESSAGES.unknown);
    }

    this.setState('stopping');
    this.stoppedAt = this.now;
    const durationMs = Math.max(0, this.stoppedAt - (this.startedAt ?? this.stoppedAt));

    const blob = await new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => {
        const type = recorder.mimeType || this.chunks[0]?.type || 'audio/webm';
        resolve(new Blob(this.chunks, { type }));
      };
      recorder.onerror = (event: Event) => {
        reject(
          new RecorderError(
            'unknown',
            ERROR_MESSAGES.unknown,
            (event as unknown as { error?: unknown }).error ?? event,
          ),
        );
      };
      try {
        recorder.stop();
      } catch (error) {
        reject(new RecorderError('unknown', ERROR_MESSAGES.unknown, error));
      }
    }).finally(() => {
      this.cleanup();
    });

    if (durationMs < MIN_RECORDING_MS || blob.size === 0) {
      throw new RecorderError('too-short', ERROR_MESSAGES['too-short']);
    }

    return {
      blob,
      mimeType: blob.type || 'audio/webm',
      duration: durationMs / 1000,
    };
  }

  /** Abandonne l'enregistrement en cours sans produire de note. */
  cancel(): void {
    const recorder = this.recorder;
    if (recorder && this.state === 'recording') {
      recorder.onstop = null;
      recorder.onerror = null;
      try {
        recorder.stop();
      } catch {
        /* déjà arrêté */
      }
    }
    this.cleanup();
  }

  private cleanup(): void {
    this.releaseStream(this.stream);
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
    this.startedAt = null;
    if (this.state !== 'idle') this.setState('idle');
  }

  private releaseStream(stream: MediaStream | null): void {
    try {
      stream?.getTracks().forEach((track) => track.stop());
    } catch {
      /* rien à faire si les pistes sont déjà arrêtées */
    }
  }
}
