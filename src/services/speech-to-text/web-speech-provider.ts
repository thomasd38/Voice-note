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
  type SpeechDiagnostics,
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

function createDiagnostics(lang: string): SpeechDiagnostics {
  return {
    lang,
    sessions: 0,
    gotAudio: false,
    gotSound: false,
    gotSpeech: false,
    resultCount: 0,
    finalCount: 0,
    errors: [],
    events: [],
  };
}

/**
 * Traduit une trace en cause probable. C'est ce qui remplace le message
 * « aucune parole détectée » affiché à tort quand le moteur n'a jamais
 * reçu la moindre bribe de son.
 */
export function diagnoseEmptyResult(diagnostics: SpeechDiagnostics): SpeechErrorKind {
  if (!diagnostics.gotAudio) return 'no-audio';
  if (!diagnostics.gotSpeech && !diagnostics.gotSound) return 'no-speech';
  return 'no-result';
}

/** Nombre de relances automatiques autorisées (voir `handleEnd`). */
const MAX_RESTARTS = 20;

/**
 * En dessous de ce délai, une session qui se termine sans avoir reçu le moindre
 * son n'est pas un silence de l'utilisateur : le moteur n'a pas eu le micro.
 * Le relancer en boucle ne servirait à rien — autant le dire tout de suite.
 */
const IMMEDIATE_END_MS = 700;
const MAX_EMPTY_SESSIONS = 3;

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

  /* --- Diagnostic ---------------------------------------------------------
     Le moteur du navigateur est une boîte noire : sans cette trace, une
     transcription vide est indiscernable d'un micro jamais ouvert. */
  private startedAt = 0;
  private sessionStartedAt = 0;
  private emptySessions = 0;
  private diagnostics: SpeechDiagnostics = createDiagnostics('fr-FR');

  getDiagnostics(): SpeechDiagnostics {
    return { ...this.diagnostics, events: [...this.diagnostics.events] };
  }

  private trace(name: string): void {
    const at = Date.now() - this.startedAt;
    // Une trace bornée : on garde le début (le plus parlant) et on s'arrête.
    if (this.diagnostics.events.length < 60) this.diagnostics.events.push({ at, name });
  }

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
    this.emptySessions = 0;
    this.stopping = false;
    this.lang = options.lang;
    this.startedAt = Date.now();
    this.sessionStartedAt = this.startedAt;
    this.diagnostics = createDiagnostics(options.lang);
    this.diagnostics.sessions = 1;

    const recognition = new Ctor();
    recognition.lang = options.lang;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => this.handleResult(event);
    recognition.onerror = (event) => this.handleError(event);
    recognition.onend = () => this.handleEnd();

    // Ces quatre événements sont le seul moyen de savoir si le moteur a
    // réellement obtenu le micro, entendu du son, puis de la parole.
    recognition.onstart = () => this.trace('start');
    recognition.onaudiostart = () => {
      this.diagnostics.gotAudio = true;
      this.trace('audiostart');
    };
    recognition.onsoundstart = () => {
      this.diagnostics.gotSound = true;
      this.trace('soundstart');
    };
    recognition.onspeechstart = () => {
      this.diagnostics.gotSpeech = true;
      this.trace('speechstart');
    };
    recognition.onnomatch = () => this.trace('nomatch');

    this.recognition = recognition;
    this.running = true;
    this.trace('start()');

    try {
      recognition.start();
    } catch (error) {
      this.running = false;
      this.recognition = null;
      this.trace(`start-threw:${(error as Error)?.name ?? 'error'}`);
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

    const text = await Promise.race([pending, timeout]);
    // Si c'est le délai qui a gagné, la reconnaissance tourne encore : on la
    // coupe pour ne pas laisser le microphone ouvert entre deux notes.
    if (this.running) this.abort();
    return text;
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
      this.diagnostics.resultCount += 1;
      if (result.isFinal) {
        this.diagnostics.finalCount += 1;
        this.finalText = `${this.finalText} ${transcript}`.replace(/\s+/g, ' ').trim();
      } else {
        interim += transcript;
      }
    }
    this.interimText = interim.trim();
    if (this.diagnostics.events.length < 60) this.trace(`result(${this.diagnostics.finalCount})`);
    this.emitResult();
  }

  private handleError(event: SpeechRecognitionErrorEvent): void {
    const kind = mapErrorCode(event.error);
    this.trace(`error:${event.error}`);
    // `aborted` = arrêt voulu par l'application, et `no-speech` en fin
    // d'enregistrement : ce ne sont pas des pannes, la note est juste vide.
    if (kind === 'aborted') return;
    if (kind === 'no-speech' && this.stopping) return;

    this.emitError(new SpeechError(kind, SPEECH_ERROR_MESSAGES[kind], event));

    if (kind === 'permission-denied' || kind === 'network' || kind === 'language-unavailable') {
      this.running = false;
      this.stopping = true;
    }
  }

  private emitError(error: SpeechError): void {
    this.diagnostics.errors.push(error.kind);
    for (const listener of this.errorListeners) listener(error);
  }

  private handleEnd(): void {
    this.trace('end');

    // Une session qui se termine aussitôt sans avoir reçu de son signale que le
    // moteur n'a pas obtenu le micro (souvent parce que l'enregistrement le
    // détient déjà). La relancer en boucle ne ferait que masquer le problème.
    const sessionDuration = Date.now() - this.sessionStartedAt;
    if (sessionDuration < IMMEDIATE_END_MS && !this.diagnostics.gotAudio) {
      this.emptySessions += 1;
    } else {
      this.emptySessions = 0;
    }

    const giveUp = this.emptySessions >= MAX_EMPTY_SESSIONS;

    // Chrome coupe la reconnaissance après quelques secondes de silence, même
    // avec `continuous = true`. Tant que l'utilisateur enregistre, on relance.
    if (
      this.running &&
      !this.stopping &&
      !giveUp &&
      this.restarts < MAX_RESTARTS &&
      this.recognition
    ) {
      this.restarts += 1;
      this.diagnostics.sessions += 1;
      this.sessionStartedAt = Date.now();
      try {
        this.recognition.start();
        this.trace(`restart#${this.restarts}`);
        return;
      } catch (error) {
        this.trace(`restart-threw:${(error as Error)?.name ?? 'error'}`);
      }
    }

    // Fin réelle de la reconnaissance. Si elle n'a jamais rien produit, on dit
    // POURQUOI plutôt que de laisser croire à un simple silence.
    this.running = false;
    const text = this.collectText();
    this.finalText = text;
    this.interimText = '';
    this.emitResult();
    this.recognition = null;

    if (!text && !this.diagnostics.errors.length) {
      const kind = diagnoseEmptyResult(this.diagnostics);
      this.trace(`empty:${kind}`);
      this.emitError(new SpeechError(kind, SPEECH_ERROR_MESSAGES[kind]));
    }

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
