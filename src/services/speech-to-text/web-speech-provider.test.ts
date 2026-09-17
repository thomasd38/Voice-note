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

  constructor() {
    FakeRecognition.instances.push(this);
  }

  start() {
    this.started += 1;
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
