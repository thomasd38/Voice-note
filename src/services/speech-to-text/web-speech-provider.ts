/**
 * Provider Speech-to-Text basé sur la Web Speech API du navigateur.
 *
 * C'est le seul provider de la V1 : il est gratuit, local au navigateur et ne
 * nécessite aucune clé d'API. Ses limites (Chrome/Edge/Safari uniquement,
 * transcription en direct seulement) sont assumées et signalées à
 * l'utilisateur ; l'enregistrement audio, lui, fonctionne partout.
 */

import {
  SpeechError,
  SPEECH_ERROR_MESSAGES,
  type SpeechErrorKind,
  type SpeechErrorListener,
  type SpeechResultListener,
  type SpeechStartOptions,
  type SpeechToTextProvider,
  type Unsubscribe,
} from './types';

type SpeechRecognitionCtor = { new (): SpeechRecognition };

function getRecognitionCtor(): SpeechRecognitionCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

function mapErrorCode(code: string): SpeechErrorKind {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'permission-denied';
    case 'no-speech':
      return 'no-speech';
    case 'network':
      return 'network';
    case 'aborted':
      return 'aborted';
    case 'language-not-supported':
      return 'language-unavailable';
    default:
      return 'unknown';
  }
}

/** Nombre de relances automatiques autorisées (voir `handleEnd`). */
const MAX_RESTARTS = 20;

export class WebSpeechProvider implements SpeechToTextProvider {
  readonly id = 'web-speech';
  readonly name = 'Reconnaissance vocale du navigateur';
  readonly mode = 'live' as const;

  private recognition: SpeechRecognition | null = null;
  private running = false;
  private stopping = false;
  private restarts = 0;
  private finalText = '';
  private interimText = '';
  private lang = 'fr-FR';
  private stopResolvers: ((text: string) => void)[] = [];
  private readonly resultListeners = new Set<SpeechResultListener>();
  private readonly errorListeners = new Set<SpeechErrorListener>();

  isSupported(): boolean {
    return Boolean(getRecognitionCtor());
  }

  onResult(listener: SpeechResultListener): Unsubscribe {
    this.resultListeners.add(listener);
    return () => this.resultListeners.delete(listener);
  }

  onError(listener: SpeechErrorListener): Unsubscribe {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  async start(options: SpeechStartOptions): Promise<void> {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      throw new SpeechError('unsupported', SPEECH_ERROR_MESSAGES.unsupported);
    }
    if (this.running) return;

    this.finalText = '';
    this.interimText = '';
    this.restarts = 0;
    this.stopping = false;
    this.lang = options.lang;

    const recognition = new Ctor();
    recognition.lang = options.lang;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => this.handleResult(event);
    recognition.onerror = (event) => this.handleError(event);
    recognition.onend = () => this.handleEnd();

    this.recognition = recognition;
    this.running = true;

    try {
      recognition.start();
    } catch (error) {
      this.running = false;
      this.recognition = null;
      throw new SpeechError('unknown', SPEECH_ERROR_MESSAGES.unknown, error);
    }
  }

  async stop(): Promise<string> {
    if (!this.recognition || !this.running) return this.finalText.trim();

    this.stopping = true;
    const pending = new Promise<string>((resolve) => {
      this.stopResolvers.push(resolve);
    });

    try {
      this.recognition.stop();
    } catch {
      this.handleEnd();
    }

    // Filet de sécurité : certains navigateurs n'émettent jamais `onend`.
    const timeout = new Promise<string>((resolve) => {
      setTimeout(() => resolve(this.collectText()), 1500);
    });

    return Promise.race([pending, timeout]);
  }

  abort(): void {
    this.stopping = true;
    const recognition = this.recognition;
    this.running = false;
    this.recognition = null;
    this.resolveStop();
    if (!recognition) return;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    try {
      recognition.abort();
    } catch {
      /* déjà terminé */
    }
  }

  private collectText(): string {
    return `${this.finalText} ${this.interimText}`.replace(/\s+/g, ' ').trim();
  }

  private handleResult(event: SpeechRecognitionEvent): void {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const transcript = result[0]?.transcript ?? '';
      if (result.isFinal) {
        this.finalText = `${this.finalText} ${transcript}`.replace(/\s+/g, ' ').trim();
      } else {
        interim += transcript;
      }
    }
    this.interimText = interim.trim();
    this.emitResult();
  }

  private handleError(event: SpeechRecognitionErrorEvent): void {
    const kind = mapErrorCode(event.error);
    // `no-speech` et `aborted` arrivent en fin d'enregistrement silencieux :
    // ce ne sont pas des pannes, la note est simplement vide.
    if (kind === 'aborted') return;
    if (kind === 'no-speech' && this.stopping) return;

    const error = new SpeechError(kind, SPEECH_ERROR_MESSAGES[kind], event);
    for (const listener of this.errorListeners) listener(error);

    if (kind === 'permission-denied' || kind === 'network' || kind === 'language-unavailable') {
      this.running = false;
      this.stopping = true;
    }
  }

  private handleEnd(): void {
    // Chrome coupe la reconnaissance après quelques secondes de silence, même
    // avec `continuous = true`. Tant que l'utilisateur enregistre, on relance.
    if (this.running && !this.stopping && this.restarts < MAX_RESTARTS && this.recognition) {
      this.restarts += 1;
      try {
        this.recognition.start();
        return;
      } catch {
        /* relance impossible : on termine proprement ci-dessous */
      }
    }

    this.running = false;
    const text = this.collectText();
    this.finalText = text;
    this.interimText = '';
    this.emitResult();
    this.recognition = null;
    this.resolveStop();
  }

  private resolveStop(): void {
    const text = this.collectText();
    const resolvers = this.stopResolvers;
    this.stopResolvers = [];
    for (const resolve of resolvers) resolve(text);
  }

  private emitResult(): void {
    const update = { final: this.finalText, interim: this.interimText };
    for (const listener of this.resultListeners) listener(update);
  }

  /** Langue courante — utile pour l'affichage et les tests. */
  getLanguage(): string {
    return this.lang;
  }
}
