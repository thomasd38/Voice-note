import { afterEach, describe, expect, it, vi } from 'vitest';
import { canRetranscribe, getSupportedProvider, listProviders } from './registry';
import { SpeechError, type SpeechToTextProvider } from './types';
import { WebSpeechProvider } from './web-speech-provider';

/* --- Doublure de SpeechRecognition ---------------------------------------- */

class FakeRecognition {
  static instances: FakeRecognition[] = [];

  lang = '';
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  started = 0;
  onresult: ((event: SpeechRecognitionEvent) => void) | null = null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null = null;
  onend: ((event: Event) => void) | null = null;
  onstart: ((event: Event) => void) | null = null;
  onaudiostart: ((event: Event) => void) | null = null;
  onaudioend: ((event: Event) => void) | null = null;
  onsoundstart: ((event: Event) => void) | null = null;
  onsoundend: ((event: Event) => void) | null = null;
  onspeechstart: ((event: Event) => void) | null = null;
  onspeechend: ((event: Event) => void) | null = null;
  onnomatch: ((event: Event) => void) | null = null;

  constructor() {
    FakeRecognition.instances.push(this);
  }

  /** Scénario simulé : ce que le moteur fait (ou ne fait pas) au démarrage. */
  static behaviour: 'normal' | 'no-audio' | 'audio-only' | 'speech-no-result' = 'normal';

  start() {
    this.started += 1;
    switch (FakeRecognition.behaviour) {
      case 'no-audio':
        // Le cas signalé : la session se termine aussitôt, sans le moindre son
        // et sans erreur — le moteur n'a jamais obtenu le microphone.
        queueMicrotask(() => this.onend?.(new Event('end')));
        break;
      case 'audio-only':
        this.onaudiostart?.(new Event('audiostart'));
        queueMicrotask(() => this.onend?.(new Event('end')));
        break;
      case 'speech-no-result':
        this.onaudiostart?.(new Event('audiostart'));
        this.onsoundstart?.(new Event('soundstart'));
        this.onspeechstart?.(new Event('speechstart'));
        queueMicrotask(() => this.onend?.(new Event('end')));
        break;
      default:
        this.onaudiostart?.(new Event('audiostart'));
        break;
    }
  }

  stop() {
    this.onend?.(new Event('end'));
  }

  abort() {
    this.onend?.(new Event('end'));
  }

  /** Simule un résultat de reconnaissance. */
  emit(transcript: string, isFinal: boolean) {
    const result = {
      0: { transcript, confidence: 0.9 },
      length: 1,
      isFinal,
      item: (index: number) => ({ transcript, confidence: 0.9 })[index] as never,
    };
    this.onresult?.({
      resultIndex: 0,
      results: { 0: result, length: 1, item: () => result } as unknown as SpeechRecognitionResultList,
    } as SpeechRecognitionEvent);
  }

  emitError(code: string) {
    this.onerror?.({ error: code, message: code } as SpeechRecognitionErrorEvent);
  }
}

function installRecognition() {
  FakeRecognition.instances = [];
  (window as { SpeechRecognition?: unknown }).SpeechRecognition = FakeRecognition;
  return () => {
    delete (window as { SpeechRecognition?: unknown }).SpeechRecognition;
  };
}

afterEach(() => {
  delete (window as { SpeechRecognition?: unknown }).SpeechRecognition;
  delete (window as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
  FakeRecognition.behaviour = 'normal';
});

/**
 * Le symptôme rapporté en usage réel : des notes systématiquement vides, avec
 * le message « aucune parole détectée » alors que l'utilisateur a parlé.
 * La cause : le moteur n'obtient jamais le micro et se termine en silence —
 * sans résultat ET sans erreur. Il ne doit plus jamais échouer sans le dire.
 */
describe('moteur qui ne reçoit aucun son', () => {
  it('signale « no-audio » au lieu de rester muet', async () => {
    const restore = installRecognition();
    FakeRecognition.behaviour = 'no-audio';

    const provider = new WebSpeechProvider();
    const errors: SpeechError[] = [];
    provider.onError((error) => errors.push(error));

    await provider.start({ lang: 'fr-FR' });
    const text = await provider.stop();

    expect(text).toBe('');
    expect(errors).toHaveLength(1);
    expect(errors[0].kind).toBe('no-audio');
    expect(errors[0].message).toContain('microphone');

    restore();
  });

  it('cesse de relancer une session qui se termine à vide', async () => {
    const restore = installRecognition();
    FakeRecognition.behaviour = 'no-audio';

    const provider = new WebSpeechProvider();
    await provider.start({ lang: 'fr-FR' });
    await provider.stop();

    // Trois sessions vides suffisent à conclure : pas 20 relances inutiles.
    expect(provider.getDiagnostics().sessions).toBeLessThanOrEqual(3);
    expect(FakeRecognition.instances[0].started).toBeLessThanOrEqual(3);

    restore();
  });

  it('distingue « micro ouvert mais silencieux » de « micro jamais ouvert »', async () => {
    const restore = installRecognition();
    FakeRecognition.behaviour = 'audio-only';

    const provider = new WebSpeechProvider();
    const errors: SpeechError[] = [];
    provider.onError((error) => errors.push(error));

    await provider.start({ lang: 'fr-FR' });
    await provider.stop();

    expect(errors[0]?.kind).toBe('no-speech');
    expect(provider.getDiagnostics().gotAudio).toBe(true);

    restore();
  });

  it('distingue « parole entendue mais aucun texte rendu »', async () => {
    const restore = installRecognition();
    FakeRecognition.behaviour = 'speech-no-result';

    const provider = new WebSpeechProvider();
    const errors: SpeechError[] = [];
    provider.onError((error) => errors.push(error));

    await provider.start({ lang: 'fr-FR' });
    await provider.stop();

    expect(errors[0]?.kind).toBe('no-result');
    const diagnostics = provider.getDiagnostics();
    expect(diagnostics.gotSpeech).toBe(true);
    expect(diagnostics.finalCount).toBe(0);

    restore();
  });

  it('ne signale aucune erreur quand du texte a bien été produit', async () => {
    const restore = installRecognition();
    const provider = new WebSpeechProvider();
    const errors: SpeechError[] = [];
    provider.onError((error) => errors.push(error));

    await provider.start({ lang: 'fr-FR' });
    FakeRecognition.instances[0].emit('une phrase bien transcrite', true);
    const text = await provider.stop();

    expect(text).toBe('une phrase bien transcrite');
    expect(errors).toHaveLength(0);

    restore();
  });

  it('expose une trace d\'événements exploitable pour le diagnostic', async () => {
    const restore = installRecognition();
    const provider = new WebSpeechProvider();

    await provider.start({ lang: 'fr-FR' });
    FakeRecognition.instances[0].emit('bonjour', true);
    await provider.stop();

    const names = provider.getDiagnostics().events.map((event) => event.name);
    expect(names).toContain('audiostart');
    expect(names.some((name) => name.startsWith('result'))).toBe(true);
    expect(provider.getDiagnostics().lang).toBe('fr-FR');

    restore();
  });
});

/* --- Tests ---------------------------------------------------------------- */

describe('support du navigateur', () => {
  it('se déclare non supporté sans API de reconnaissance', () => {
    expect(new WebSpeechProvider().isSupported()).toBe(false);
  });

  it('se déclare supporté avec le préfixe webkit', () => {
    (window as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition = FakeRecognition;
    expect(new WebSpeechProvider().isSupported()).toBe(true);
  });

  it('refuse de démarrer sans API, avec un message clair', async () => {
    const provider = new WebSpeechProvider();
    const error = await provider.start({ lang: 'fr-FR' }).catch((caught: SpeechError) => caught);
    expect(error).toBeInstanceOf(SpeechError);
    expect((error as SpeechError).kind).toBe('unsupported');
    expect((error as SpeechError).message).toContain('pas disponible dans ce navigateur');
  });
});

describe('transcription', () => {
  it('accumule les résultats finaux et expose l\'hypothèse en cours', async () => {
    const restore = installRecognition();
    const provider = new WebSpeechProvider();
    const updates: string[] = [];
    provider.onResult((update) => updates.push(`${update.final}|${update.interim}`));

    await provider.start({ lang: 'fr-FR' });
    const recognition = FakeRecognition.instances[0];
    expect(recognition.lang).toBe('fr-FR');
    expect(recognition.continuous).toBe(true);
    expect(recognition.interimResults).toBe(true);

    recognition.emit('Penser à acheter', false);
    recognition.emit('Penser à acheter une raquette', true);

    expect(updates).toEqual(['|Penser à acheter', 'Penser à acheter une raquette|']);

    const text = await provider.stop();
    expect(text).toBe('Penser à acheter une raquette');

    restore();
  });

  it('conserve l\'hypothèse en cours si l\'utilisateur arrête avant la validation', async () => {
    const restore = installRecognition();
    const provider = new WebSpeechProvider();
    await provider.start({ lang: 'fr-FR' });

    FakeRecognition.instances[0].emit('note non finalisée', false);
    const text = await provider.stop();

    expect(text).toBe('note non finalisée');
    restore();
  });

  it('relance automatiquement la reconnaissance coupée par un silence', async () => {
    const restore = installRecognition();
    const provider = new WebSpeechProvider();
    await provider.start({ lang: 'fr-FR' });
    const recognition = FakeRecognition.instances[0];
    expect(recognition.started).toBe(1);

    // Chrome termine la session après un silence : on doit repartir.
    recognition.onend?.(new Event('end'));
    expect(recognition.started).toBe(2);

    provider.abort();
    restore();
  });

  it('coupe la reconnaissance si le navigateur n\'émet jamais « end »', async () => {
    vi.useFakeTimers();
    const restore = installRecognition();
    const provider = new WebSpeechProvider();
    await provider.start({ lang: 'fr-FR' });

    const recognition = FakeRecognition.instances[0];
    recognition.emit('texte capté', true);
    // Navigateur défaillant : `stop()` n'entraîne aucun événement `end`.
    recognition.stop = () => {};
    const aborted = vi.fn();
    recognition.abort = aborted;

    const pending = provider.stop();
    await vi.advanceTimersByTimeAsync(2000);

    expect(await pending).toBe('texte capté');
    expect(aborted).toHaveBeenCalled();

    vi.useRealTimers();
    restore();
  });

  it('rend une chaîne vide quand rien n\'a été dit', async () => {
    const restore = installRecognition();
    const provider = new WebSpeechProvider();
    await provider.start({ lang: 'fr-FR' });
    expect(await provider.stop()).toBe('');
    restore();
  });
});

describe('erreurs', () => {
  it('traduit les codes d\'erreur en messages utilisateur', async () => {
    const restore = installRecognition();
    const provider = new WebSpeechProvider();
    const errors: SpeechError[] = [];
    provider.onError((error) => errors.push(error));

    await provider.start({ lang: 'fr-FR' });
    FakeRecognition.instances[0].emitError('not-allowed');

    expect(errors).toHaveLength(1);
    expect(errors[0].kind).toBe('permission-denied');
    expect(errors[0].message).not.toContain('not-allowed');

    restore();
  });

  it('ignore les interruptions volontaires', async () => {
    const restore = installRecognition();
    const provider = new WebSpeechProvider();
    const errors: SpeechError[] = [];
    provider.onError((error) => errors.push(error));

    await provider.start({ lang: 'fr-FR' });
    FakeRecognition.instances[0].emitError('aborted');

    expect(errors).toHaveLength(0);
    restore();
  });

  it('signale une panne réseau du moteur de reconnaissance', async () => {
    const restore = installRecognition();
    const provider = new WebSpeechProvider();
    const errors: SpeechError[] = [];
    provider.onError((error) => errors.push(error));

    await provider.start({ lang: 'fr-FR' });
    FakeRecognition.instances[0].emitError('network');

    expect(errors[0].kind).toBe('network');
    restore();
  });
});

describe('registre des providers', () => {
  it('expose le provider Web Speech', () => {
    expect(listProviders().some((provider) => provider.id === 'web-speech')).toBe(true);
  });

  it('ne renvoie aucun provider quand aucun n\'est supporté', () => {
    expect(getSupportedProvider('web-speech')).toBeUndefined();
  });

  it('renvoie le provider demandé quand il est supporté', () => {
    const restore = installRecognition();
    expect(getSupportedProvider('web-speech')?.id).toBe('web-speech');
    restore();
  });

  it('n\'autorise la re-transcription que pour les providers « batch »', () => {
    expect(canRetranscribe(new WebSpeechProvider())).toBe(false);

    const batchProvider = {
      id: 'whisper',
      name: 'Whisper',
      mode: 'batch',
      isSupported: () => true,
      start: vi.fn(),
      stop: vi.fn(),
      abort: vi.fn(),
      onResult: vi.fn(),
      onError: vi.fn(),
      transcribe: vi.fn(),
    } as unknown as SpeechToTextProvider;

    expect(canRetranscribe(batchProvider)).toBe(true);
  });
});
