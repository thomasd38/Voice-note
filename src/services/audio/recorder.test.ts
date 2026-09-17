import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioRecorder, RecorderError, isRecordingSupported } from './recorder';

/* --- Doublures des APIs navigateur ---------------------------------------- */

class FakeMediaRecorder {
  static isTypeSupported = (type: string) => type === 'audio/webm;codecs=opus';

  state: 'inactive' | 'recording' = 'inactive';
  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  /** Permet aux tests de simuler un enregistrement vide. */
  static nextChunk: Blob | null = null;

  constructor(
    public stream: MediaStream,
    options?: { mimeType?: string },
  ) {
    this.mimeType = options?.mimeType ?? 'audio/webm';
  }

  start() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    const chunk = FakeMediaRecorder.nextChunk ?? new Blob(['audio'], { type: this.mimeType });
    if (chunk.size > 0) this.ondataavailable?.({ data: chunk });
    this.onstop?.();
  }
}

function fakeStream() {
  const track = { stop: vi.fn() };
  return {
    stream: { getTracks: () => [track] } as unknown as MediaStream,
    track,
  };
}

function setup(getUserMedia?: () => Promise<MediaStream>) {
  const { stream, track } = fakeStream();
  const mediaDevices = {
    getUserMedia: vi.fn(getUserMedia ?? (async () => stream)),
  } as unknown as MediaDevices;
  let clock = 0;
  const recorder = new AudioRecorder({
    mediaDevices,
    recorderCtor: FakeMediaRecorder as unknown as typeof MediaRecorder,
    now: () => clock,
  });
  return {
    recorder,
    mediaDevices,
    track,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

function domError(name: string) {
  const error = new Error(name);
  error.name = name;
  return error;
}

beforeEach(() => {
  FakeMediaRecorder.nextChunk = null;
});

/* --- Tests ---------------------------------------------------------------- */

describe('cycle d\'enregistrement', () => {
  it('passe par idle → recording → idle et produit un blob', async () => {
    const { recorder, advance } = setup();
    expect(recorder.getState()).toBe('idle');

    await recorder.start();
    expect(recorder.getState()).toBe('recording');

    advance(3200);
    expect(recorder.getElapsedSeconds()).toBeCloseTo(3.2);

    const result = await recorder.stop();
    expect(result.blob.size).toBeGreaterThan(0);
    expect(result.duration).toBeCloseTo(3.2);
    expect(result.mimeType).toContain('audio/webm');
    expect(recorder.getState()).toBe('idle');
  });

  it('notifie chaque changement d\'état', async () => {
    const { recorder, advance } = setup();
    const states: string[] = [];
    recorder.onStateChange((state) => states.push(state));

    await recorder.start();
    advance(1000);
    await recorder.stop();

    expect(states).toEqual(['requesting', 'recording', 'stopping', 'idle']);
  });

  it('libère le microphone après l\'arrêt', async () => {
    const { recorder, track, advance } = setup();
    await recorder.start();
    advance(1000);
    await recorder.stop();
    expect(track.stop).toHaveBeenCalled();
  });

  it('ignore un second démarrage pendant un enregistrement', async () => {
    const { recorder, mediaDevices } = setup();
    await recorder.start();
    await recorder.start();
    expect(mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
  });

  it('choisit le meilleur format supporté', async () => {
    const { recorder, advance } = setup();
    await recorder.start();
    advance(1000);
    const result = await recorder.stop();
    expect(result.mimeType).toBe('audio/webm;codecs=opus');
  });
});

describe('annulation', () => {
  it('coupe le micro sans produire de résultat', async () => {
    const { recorder, track } = setup();
    await recorder.start();

    recorder.cancel();

    expect(recorder.getState()).toBe('idle');
    expect(track.stop).toHaveBeenCalled();
  });
});

describe('gestion des erreurs', () => {
  it('traduit un refus de permission', async () => {
    const { recorder } = setup(async () => {
      throw domError('NotAllowedError');
    });

    await expect(recorder.start()).rejects.toMatchObject({ kind: 'permission-denied' });
    expect(recorder.getState()).toBe('idle');
  });

  it('traduit l\'absence de microphone', async () => {
    const { recorder } = setup(async () => {
      throw domError('NotFoundError');
    });
    await expect(recorder.start()).rejects.toMatchObject({ kind: 'no-microphone' });
  });

  it('traduit un microphone déjà utilisé', async () => {
    const { recorder } = setup(async () => {
      throw domError('NotReadableError');
    });
    await expect(recorder.start()).rejects.toMatchObject({ kind: 'microphone-busy' });
  });

  it('signale un enregistrement arrêté immédiatement', async () => {
    const { recorder, advance } = setup();
    await recorder.start();
    advance(120); // sous le seuil de 350 ms

    await expect(recorder.stop()).rejects.toMatchObject({ kind: 'too-short' });
    expect(recorder.getState()).toBe('idle');
  });

  it('signale un enregistrement vide', async () => {
    const { recorder, advance } = setup();
    FakeMediaRecorder.nextChunk = new Blob([], { type: 'audio/webm' });
    await recorder.start();
    advance(2000);

    await expect(recorder.stop()).rejects.toMatchObject({ kind: 'too-short' });
  });

  it('refuse de s\'arrêter si aucun enregistrement n\'est en cours', async () => {
    const { recorder } = setup();
    await expect(recorder.stop()).rejects.toBeInstanceOf(RecorderError);
  });

  it('signale un navigateur sans MediaRecorder', async () => {
    const recorder = new AudioRecorder({
      mediaDevices: undefined,
      recorderCtor: undefined,
    });
    await expect(recorder.start()).rejects.toMatchObject({ kind: 'unsupported' });
  });

  it('propose des messages compréhensibles, jamais de code technique', async () => {
    const { recorder } = setup(async () => {
      throw domError('NotAllowedError');
    });
    const error = await recorder.start().catch((caught: RecorderError) => caught);
    expect((error as RecorderError).message).toContain('microphone');
    expect((error as RecorderError).message).not.toContain('NotAllowedError');
  });
});

describe('isRecordingSupported', () => {
  it('détecte la présence des deux APIs nécessaires', () => {
    const { stream } = fakeStream();
    expect(
      isRecordingSupported({
        mediaDevices: { getUserMedia: async () => stream } as unknown as MediaDevices,
        recorderCtor: FakeMediaRecorder as unknown as typeof MediaRecorder,
      }),
    ).toBe(true);

    expect(isRecordingSupported({ mediaDevices: undefined, recorderCtor: undefined })).toBe(false);
  });
});
