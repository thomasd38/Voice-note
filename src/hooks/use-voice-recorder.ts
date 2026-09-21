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
  /**
   * Numéro de la session d'enregistrement en cours.
   *
   * Le démarrage du moteur de transcription est asynchrone : si l'utilisateur
   * arrête l'enregistrement pendant ce court instant, la session qui se
   * terminait ne doit pas se déclarer « démarrée » après coup — sinon le micro
   * resterait ouvert et la note afficherait une erreur trompeuse.
   */
  const sessionRef = useRef(0);
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
    const session = sessionRef.current + 1;
    sessionRef.current = session;
    speechErrorRef.current = null;
    speechStartedRef.current = false;
    setLiveTranscript('');
    setStatus('requesting');

    // 1. Le moteur de transcription DÉMARRE EN PREMIER.
    //
    // Deux raisons, qui expliquaient des notes systématiquement vides :
    //  - le micro est partagé, et le moteur du navigateur est le consommateur
    //    fragile : arrivé après MediaRecorder, il n'obtient aucun son sur
    //    plusieurs plateformes (Safari iOS, Chrome Android) et rend un texte
    //    vide sans la moindre erreur ;
    //  - Safari exige que `recognition.start()` parte d'un geste utilisateur.
    //    Or `await` rompt cette chaîne : démarrer le moteur après la demande de
    //    micro le plaçait hors du geste, et l'appel échouait en silence.
    // Le démarrer d'abord règle les deux — et évite de perdre le premier mot.
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
        if (sessionRef.current !== session) {
          // L'enregistrement s'est arrêté pendant le démarrage du moteur :
          // on referme immédiatement ce qui vient de s'ouvrir.
          speechProvider.abort();
          detachSpeech();
          busyRef.current = false;
          setStatus('idle');
          return;
        }
        speechStartedRef.current = true;
      } catch (error) {
        speechStartedRef.current = false;
        if (error instanceof SpeechError) speechErrorRef.current = error;
        detachSpeech();
      }
    }

    // 2. Puis l'enregistrement audio — qui, lui, ne doit JAMAIS être sacrifié.
    try {
      await recorder.start();
      setPermissionDenied(false);
    } catch (error) {
      // Le micro peut avoir été refusé au magnétophone parce que le moteur de
      // transcription le monopolise : on libère la transcription et on retente
      // une fois. Mieux vaut un audio sans texte que rien du tout.
      //
      // Uniquement en cas de conflit de périphérique : réessayer après un refus
      // d'autorisation ne ferait que redemander la permission pour rien.
      const deviceConflict = error instanceof RecorderError && error.kind === 'microphone-busy';
      let recovered = false;
      if (deviceConflict && speechStartedRef.current && speechProvider) {
        speechProvider.abort();
        detachSpeech();
        speechStartedRef.current = false;
        speechErrorRef.current = new SpeechError(
          'no-audio',
          "La transcription a été désactivée pour cet enregistrement : sur cet appareil, le microphone ne peut pas être partagé avec le moteur de reconnaissance.",
        );
        try {
          await recorder.start();
          setPermissionDenied(false);
          recovered = true;
        } catch {
          /* second échec : on remonte l'erreur d'origine ci-dessous */
        }
      }

      if (!recovered) {
        speechProvider?.abort();
        detachSpeech();
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
    }

    setStatus('recording');
    busyRef.current = false;
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
    // Clôt la session : un démarrage de transcription encore en vol s'annulera.
    sessionRef.current += 1;
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
    sessionRef.current += 1;
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
