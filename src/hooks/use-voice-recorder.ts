import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AudioRecorder,
  RecorderError,
  isRecordingSupported,
  type RecordingResult,
} from '../services/audio/recorder';
import { getSupportedProvider } from '../services/speech-to-text/registry';
import { SpeechError } from '../services/speech-to-text/types';
import type { Note, NoteDraft, TranscriptionStatus } from '../types/note';
import type { Settings } from '../types/settings';

export type RecordingStatus = 'idle' | 'requesting' | 'recording' | 'processing';

interface UseVoiceRecorderOptions {
  settings: Settings;
  createNote: (draft: NoteDraft) => Promise<Note | null>;
  onNoteCreated?: (note: Note) => void;
  onError: (message: string) => void;
  onInfo?: (message: string) => void;
}

/**
 * Orchestration « appuyer pour enregistrer ».
 *
 * Deux systèmes indépendants tournent en parallèle :
 *   1. `AudioRecorder` (MediaRecorder) produit le fichier audio ;
 *   2. le provider Speech-to-Text écoute et produit le texte.
 *
 * Si le second échoue ou n'existe pas, le premier continue : on obtient une
 * note avec audio et sans transcription, jamais un plantage.
 */
export function useVoiceRecorder({
  settings,
  createNote,
  onNoteCreated,
  onError,
  onInfo,
}: UseVoiceRecorderOptions) {
  const [status, setStatus] = useState<RecordingStatus>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [permissionDenied, setPermissionDenied] = useState(false);

  const recorderRef = useRef<AudioRecorder | null>(null);
  if (recorderRef.current === null) recorderRef.current = new AudioRecorder();
  const recorder = recorderRef.current;

  const speechProvider = useMemo(
    () => getSupportedProvider(settings.speechProviderId),
    [settings.speechProviderId],
  );
  const speechSupported = Boolean(speechProvider?.isSupported());
  const recordingSupported = useMemo(() => isRecordingSupported(), []);

  // Refs : les callbacks doivent rester stables même si le rendu change.
  const speechStartedRef = useRef(false);
  const speechErrorRef = useRef<SpeechError | null>(null);
  const unsubscribeRef = useRef<(() => void)[]>([]);
  const busyRef = useRef(false);
  const handlersRef = useRef({ onError, onInfo, onNoteCreated, createNote });
  handlersRef.current = { onError, onInfo, onNoteCreated, createNote };

  // Minuteur d'affichage (00:17) : 200 ms suffisent pour une seconde fluide.
  useEffect(() => {
    if (status !== 'recording') return undefined;
    setElapsed(recorder.getElapsedSeconds());
    const interval = window.setInterval(() => {
      setElapsed(recorder.getElapsedSeconds());
    }, 200);
    return () => window.clearInterval(interval);
  }, [status, recorder]);

  const detachSpeech = useCallback(() => {
    unsubscribeRef.current.forEach((unsubscribe) => unsubscribe());
    unsubscribeRef.current = [];
  }, []);

  const start = useCallback(async () => {
    if (busyRef.current || recorder.getState() !== 'idle') return;
    busyRef.current = true;
    speechErrorRef.current = null;
    speechStartedRef.current = false;
    setLiveTranscript('');
    setStatus('requesting');

    try {
      await recorder.start();
      setPermissionDenied(false);
    } catch (error) {
      setStatus('idle');
      busyRef.current = false;
      if (error instanceof RecorderError) {
        if (error.kind === 'permission-denied') setPermissionDenied(true);
        handlersRef.current.onError(error.message);
      } else {
        handlersRef.current.onError("L'enregistrement n'a pas pu démarrer.");
      }
      return;
    }

    setStatus('recording');
    busyRef.current = false;

    // La transcription démarre après l'enregistrement : même si elle échoue,
    // l'audio est déjà en cours de capture.
    if (settings.autoTranscribe && speechProvider) {
      unsubscribeRef.current = [
        speechProvider.onResult(({ final, interim }) => {
          setLiveTranscript(`${final} ${interim}`.replace(/\s+/g, ' ').trim());
        }),
        speechProvider.onError((error) => {
          speechErrorRef.current = error;
        }),
      ];
      try {
        await speechProvider.start({ lang: settings.language });
        speechStartedRef.current = true;
      } catch (error) {
        speechStartedRef.current = false;
        if (error instanceof SpeechError) speechErrorRef.current = error;
        detachSpeech();
      }
    }
  }, [detachSpeech, recorder, settings.autoTranscribe, settings.language, speechProvider]);

  const finalizeNote = useCallback(
    async (result: RecordingResult | null, transcript: string) => {
      const speechError = speechErrorRef.current;
      const text = transcript.trim();

      let transcriptionStatus: TranscriptionStatus;
      let transcriptionError: string | undefined;

      if (!settings.autoTranscribe || !speechProvider || !speechStartedRef.current) {
        transcriptionStatus = 'unavailable';
        transcriptionError = !settings.autoTranscribe
          ? 'La transcription automatique est désactivée dans les paramètres.'
          : (speechError?.message ??
            "La transcription automatique n'est pas disponible dans ce navigateur.");
      } else if (text) {
        transcriptionStatus = 'completed';
      } else if (speechError) {
        transcriptionStatus = 'error';
        transcriptionError = speechError.message;
      } else {
        transcriptionStatus = 'error';
        transcriptionError = "Aucune parole n'a été détectée. Vous pouvez écrire la note à la main.";
      }

      const draft: NoteDraft = {
        transcription: text,
        transcriptionStatus,
        transcriptionError,
        transcriptionProvider: speechStartedRef.current ? speechProvider?.id : undefined,
        language: settings.language,
      };
      if (result) {
        draft.audioBlob = result.blob;
        draft.mimeType = result.mimeType;
        draft.duration = result.duration;
      }

      const note = await handlersRef.current.createNote(draft);
      if (note) handlersRef.current.onNoteCreated?.(note);
      return note;
    },
    [settings.autoTranscribe, settings.language, speechProvider],
  );

  const stop = useCallback(async () => {
    if (recorder.getState() !== 'recording' || busyRef.current) return;
    busyRef.current = true;
    setStatus('processing');

    let result: RecordingResult | null = null;
    let recorderError: RecorderError | null = null;
    try {
      result = await recorder.stop();
    } catch (error) {
      recorderError = error instanceof RecorderError ? error : null;
    }

    let transcript = '';
    if (speechStartedRef.current && speechProvider) {
      try {
        transcript = await speechProvider.stop();
      } catch {
        /* l'erreur éventuelle a déjà été captée par `onError` du provider */
      }
    } else {
      speechProvider?.abort();
    }
    detachSpeech();

    if (!result) {
      // Enregistrement inexploitable (arrêt immédiat) : on n'enregistre rien.
      setStatus('idle');
      setLiveTranscript('');
      busyRef.current = false;
      handlersRef.current.onError(
        recorderError?.message ?? "L'enregistrement n'a pas pu être finalisé.",
      );
      return;
    }

    await finalizeNote(result, transcript);
    setStatus('idle');
    setLiveTranscript('');
    setElapsed(0);
    busyRef.current = false;
  }, [detachSpeech, finalizeNote, recorder, speechProvider]);

  const cancel = useCallback(() => {
    if (recorder.getState() === 'idle') return;
    recorder.cancel();
    speechProvider?.abort();
    detachSpeech();
    setStatus('idle');
    setLiveTranscript('');
    setElapsed(0);
    busyRef.current = false;
    handlersRef.current.onInfo?.('Enregistrement annulé.');
  }, [detachSpeech, recorder, speechProvider]);

  const toggle = useCallback(() => {
    if (status === 'recording') void stop();
    else if (status === 'idle') void start();
  }, [start, status, stop]);

  // Sécurité : si le composant disparaît pendant un enregistrement, on relâche
  // le microphone (l'utilisateur ne doit jamais voir le voyant rester allumé).
  useEffect(
    () => () => {
      recorder.cancel();
      speechProvider?.abort();
    },
    [recorder, speechProvider],
  );

  return {
    status,
    elapsed,
    liveTranscript,
    permissionDenied,
    speechSupported,
    recordingSupported,
    speechProviderName: speechProvider?.name,
    start,
    stop,
    toggle,
    cancel,
  };
}

export type VoiceRecorderApi = ReturnType<typeof useVoiceRecorder>;
