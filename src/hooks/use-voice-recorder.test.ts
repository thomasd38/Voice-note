import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVoiceRecorder } from './use-voice-recorder';
import { DEFAULT_SETTINGS } from '../types/settings';
import type { Note, NoteDraft } from '../types/note';

/**
 * Test d'intégration de l'orchestration « enregistrement + transcription ».
 *
 * Seules les deux API navigateur sont simulées (MediaRecorder / getUserMedia et
 * SpeechRecognition) : le magnétophone, le provider et le hook sont les vrais.
 * C'est à ce niveau que se jouait le bug rapporté — une note toujours vide —,
 * donc c'est à ce niveau qu'il faut le verrouiller.
 */

/* --- Doublures des API navigateur ----------------------------------------- */

/** Ordre réel d'acquisition du micro, au cœur du problème. */
let acquisitionOrder: string[] = [];

class FakeRecognition {
  static instances: FakeRecognition[] = [];
  /** `silent` : le moteur n'obtient pas le micro (cas signalé). */
  static behaviour: 'normal' | 'silent' = 'normal';
  static transcript = 'une note dictée à voix haute';

  lang = '';
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
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

  start() {
    acquisitionOrder.push('speech');
    if (FakeRecognition.behaviour === 'silent') {
      queueMicrotask(() => this.onend?.(new Event('end')));
      return;
    }
    this.onaudiostart?.(new Event('audiostart'));
    this.onspeechstart?.(new Event('speechstart'));
    queueMicrotask(() => {
      const transcript = FakeRecognition.transcript;
      const result = {
        0: { transcript, confidence: 0.9 },
        length: 1,
        isFinal: true,
        item: () => ({ transcript, confidence: 0.9 }),
      };
      this.onresult?.({
        resultIndex: 0,
        results: { 0: result, length: 1, item: () => result } as unknown as SpeechRecognitionResultList,
      } as SpeechRecognitionEvent);
    });
  }

  stop() {
    this.onend?.(new Event('end'));
  }

  abort() {
    this.onend?.(new Event('end'));
  }
}

class FakeMediaRecorder {
  static isTypeSupported = () => true;
  state: 'inactive' | 'recording' = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(_stream: MediaStream, options?: { mimeType?: string }) {
    this.mimeType = options?.mimeType ?? 'audio/webm';
  }

  start() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['audio'], { type: this.mimeType }) });
    this.onstop?.();
  }
}

/**
 * Nombre d'accès au micro qui doivent échouer : simule un appareil où le
 * moteur de reconnaissance et l'enregistrement ne peuvent pas cohabiter.
 */
let micFailuresRemaining = 0;

function installBrowserApis() {
  acquisitionOrder = [];
  FakeRecognition.instances = [];
  FakeRecognition.behaviour = 'normal';
  micFailuresRemaining = 0;

  (window as { SpeechRecognition?: unknown }).SpeechRecognition = FakeRecognition;
  (globalThis as { MediaRecorder?: unknown }).MediaRecorder = FakeMediaRecorder;

  const getUserMedia = vi.fn(async () => {
    acquisitionOrder.push('recorder');
    if (micFailuresRemaining > 0) {
      micFailuresRemaining -= 1;
      const error = new Error('busy');
      error.name = 'NotReadableError';
      throw error;
    }
    return { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
  });

  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia },
    configurable: true,
  });

  return getUserMedia;
}

/* --- Harnais -------------------------------------------------------------- */

function setup(overrides: Partial<typeof DEFAULT_SETTINGS> = {}) {
  const created: NoteDraft[] = [];
  const errors: string[] = [];
  const createNote = vi.fn(async (draft: NoteDraft) => {
    created.push(draft);
    return { id: 'note-1', ...draft } as unknown as Note;
  });

  const view = renderHook(() =>
    useVoiceRecorder({
      settings: { ...DEFAULT_SETTINGS, ...overrides },
      createNote,
      onError: (message) => errors.push(message),
    }),
  );

  return { view, created, errors, createNote };
}

/** Enregistre puis arrête, en laissant passer la durée minimale. */
async function recordOnce(view: ReturnType<typeof setup>['view']) {
  await act(async () => {
    await view.result.current.start();
  });
  // Au-delà du seuil « enregistrement trop court ».
  vi.setSystemTime(Date.now() + 1500);
  await act(async () => {
    await view.result.current.stop();
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  installBrowserApis();
});

afterEach(() => {
  vi.useRealTimers();
  delete (window as { SpeechRecognition?: unknown }).SpeechRecognition;
});

/* --- Tests ---------------------------------------------------------------- */

describe('partage du microphone', () => {
  it('démarre la transcription AVANT de prendre le micro pour l\'enregistrement', async () => {
    const { view } = setup();
    await recordOnce(view);

    // L'ordre est la correction de fond : le moteur de reconnaissance est le
    // consommateur fragile, il doit passer en premier.
    expect(acquisitionOrder).toEqual(['speech', 'recorder']);
  });

  it('crée une note transcrite quand tout se passe bien', async () => {
    const { view, created } = setup();
    await recordOnce(view);

    await waitFor(() => expect(created).toHaveLength(1));
    expect(created[0].transcription).toBe('une note dictée à voix haute');
    expect(created[0].transcriptionStatus).toBe('completed');
    expect(created[0].audioBlob).toBeInstanceOf(Blob);
  });

  it('garde l\'audio quand le micro ne peut pas être partagé', async () => {
    const getUserMedia = installBrowserApis();
    // Le premier accès du magnétophone échoue : le moteur tient déjà le micro.
    // Le second, une fois le moteur libéré, doit réussir.
    micFailuresRemaining = 1;
    const { view, created, errors } = setup();

    await recordOnce(view);

    await waitFor(() => expect(created).toHaveLength(1));
    // L'enregistrement audio n'est jamais sacrifié à la transcription…
    expect(created[0].audioBlob).toBeInstanceOf(Blob);
    // … et l'utilisateur apprend pourquoi le texte manque.
    expect(created[0].transcriptionStatus).toBe('unavailable');
    expect(created[0].transcriptionError).toContain('partagé');
    expect(errors).toHaveLength(0);
    expect(getUserMedia).toHaveBeenCalledTimes(2);
  });

  it('remonte une erreur claire si le micro reste inaccessible', async () => {
    installBrowserApis();
    micFailuresRemaining = 99;
    const { view, created, errors } = setup();

    await act(async () => {
      await view.result.current.start();
    });

    expect(created).toHaveLength(0);
    expect(errors[0]).toContain('microphone');
    expect(view.result.current.status).toBe('idle');
  });
});

describe('transcription vide', () => {
  it('explique que le moteur n\'a reçu aucun son, au lieu de « aucune parole »', async () => {
    installBrowserApis();
    FakeRecognition.behaviour = 'silent';
    const { view, created } = setup();

    await recordOnce(view);

    await waitFor(() => expect(created).toHaveLength(1));
    expect(created[0].transcription).toBe('');
    expect(created[0].transcriptionStatus).toBe('error');
    // Le message trompeur d'origine ne doit plus apparaître dans ce cas.
    expect(created[0].transcriptionError).not.toContain("Aucune parole n'a été détectée.");
    expect(created[0].transcriptionError).toContain('son');
    // L'audio, lui, est bien là.
    expect(created[0].audioBlob).toBeInstanceOf(Blob);
  });

  it('indique que la transcription est désactivée quand le réglage est off', async () => {
    const { view, created } = setup({ autoTranscribe: false });
    await recordOnce(view);

    await waitFor(() => expect(created).toHaveLength(1));
    expect(acquisitionOrder).toEqual(['recorder']);
    expect(created[0].transcriptionStatus).toBe('unavailable');
    expect(created[0].transcriptionError).toContain('désactivée');
  });
});
