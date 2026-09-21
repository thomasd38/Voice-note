import { useCallback, useRef, useState } from 'react';
import { AudioRecorder } from '../services/audio/recorder';
import { getSupportedProvider } from '../services/speech-to-text/registry';
import { SpeechError, type SpeechDiagnostics } from '../services/speech-to-text/types';

interface SpeechTestProps {
  providerId: string;
  lang: string;
}

type Phase = 'idle' | 'alone' | 'with-recorder' | 'done';

interface Outcome {
  text: string;
  error: string | null;
  diagnostics: SpeechDiagnostics | null;
}

const LISTEN_MS = 7000;

/**
 * Diagnostic de la transcription.
 *
 * Le moteur du navigateur est une boîte noire : quand il ne rend rien, seule
 * une comparaison dit pourquoi. On écoute donc deux fois —
 *   1. le moteur seul ;
 *   2. le moteur pendant un enregistrement, comme pour une vraie note.
 *
 * Si le premier essai fonctionne et pas le second, le microphone ne peut pas
 * être partagé sur cet appareil : c'est la panne la plus courante, et elle est
 * invisible autrement (le moteur rend un texte vide, sans erreur).
 */
export function SpeechTest({ providerId, lang }: SpeechTestProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [live, setLive] = useState('');
  const [alone, setAlone] = useState<Outcome | null>(null);
  const [withRecorder, setWithRecorder] = useState<Outcome | null>(null);
  const cancelRef = useRef(false);

  const listen = useCallback(
    async (useRecorder: boolean): Promise<Outcome> => {
      const provider = getSupportedProvider(providerId);
      if (!provider) {
        return {
          text: '',
          error: "Aucun moteur de transcription n'est disponible dans ce navigateur.",
          diagnostics: null,
        };
      }

      let capturedError: string | null = null;
      const unsubscribe = [
        provider.onResult(({ final, interim }) =>
          setLive(`${final} ${interim}`.replace(/\s+/g, ' ').trim()),
        ),
        provider.onError((error: SpeechError) => {
          capturedError = error.message;
        }),
      ];

      const recorder = useRecorder ? new AudioRecorder() : null;
      setLive('');

      try {
        await provider.start({ lang });
      } catch (error) {
        unsubscribe.forEach((off) => off());
        return {
          text: '',
          error: error instanceof SpeechError ? error.message : 'Le moteur n\'a pas pu démarrer.',
          diagnostics: provider.getDiagnostics(),
        };
      }

      // Même ordre que pour une vraie note : moteur d'abord, micro ensuite.
      if (recorder) {
        try {
          await recorder.start();
        } catch (error) {
          capturedError =
            error instanceof Error ? error.message : "L'enregistrement n'a pas pu démarrer.";
        }
      }

      await new Promise((resolve) => setTimeout(resolve, LISTEN_MS));

      const text = await provider.stop().catch(() => '');
      if (recorder) recorder.cancel();
      unsubscribe.forEach((off) => off());
      setLive('');

      return { text, error: capturedError, diagnostics: provider.getDiagnostics() };
    },
    [lang, providerId],
  );

  const run = useCallback(async () => {
    cancelRef.current = false;
    setAlone(null);
    setWithRecorder(null);

    setPhase('alone');
    const first = await listen(false);
    if (cancelRef.current) {
      setPhase('idle');
      return;
    }
    setAlone(first);

    setPhase('with-recorder');
    const second = await listen(true);
    setWithRecorder(second);
    setPhase('done');
  }, [listen]);

  const running = phase === 'alone' || phase === 'with-recorder';

  return (
    <div className="speech-test">
      <button
        type="button"
        className="button button--ghost"
        onClick={() => void run()}
        disabled={running}
      >
        {running ? 'Test en cours…' : 'Tester la transcription'}
      </button>

      {running && (
        <div className="speech-test__live" role="status">
          <p className="speech-test__step">
            {phase === 'alone'
              ? '1/2 — Parlez maintenant : test du moteur seul.'
              : "2/2 — Parlez encore : test pendant un enregistrement."}
          </p>
          <p className="speech-test__transcript">{live || '…'}</p>
        </div>
      )}

      {phase === 'done' && alone && withRecorder && (
        <Verdict alone={alone} withRecorder={withRecorder} />
      )}
    </div>
  );
}

function summarize(outcome: Outcome): string {
  const diagnostics = outcome.diagnostics;
  if (!diagnostics) return outcome.error ?? 'Aucun résultat.';
  const parts = [
    `sessions ${diagnostics.sessions}`,
    `audio ${diagnostics.gotAudio ? 'oui' : 'NON'}`,
    `parole ${diagnostics.gotSpeech ? 'oui' : 'non'}`,
    `résultats ${diagnostics.finalCount}`,
  ];
  if (diagnostics.errors.length) parts.push(`erreurs ${diagnostics.errors.join(', ')}`);
  return parts.join(' · ');
}

function Verdict({ alone, withRecorder }: { alone: Outcome; withRecorder: Outcome }) {
  const aloneWorked = Boolean(alone.text);
  const bothWorked = Boolean(withRecorder.text);

  let verdict: string;
  let tone: 'ok' | 'warn' | 'error';

  if (aloneWorked && bothWorked) {
    verdict =
      'La transcription fonctionne, y compris pendant un enregistrement. Si une note reste vide, parlez plus près du micro ou vérifiez la langue choisie.';
    tone = 'ok';
  } else if (aloneWorked && !bothWorked) {
    verdict =
      "Le moteur fonctionne seul, mais pas pendant un enregistrement : sur cet appareil, le microphone ne peut pas être partagé. Désactivez la transcription automatique pour garder l'audio, ou utilisez un navigateur de bureau (Chrome, Edge).";
    tone = 'warn';
  } else if (!aloneWorked && alone.diagnostics && !alone.diagnostics.gotAudio) {
    verdict =
      "Le moteur n'a reçu aucun son : vérifiez l'autorisation du microphone et le périphérique d'entrée sélectionné par le système.";
    tone = 'error';
  } else if (alone.diagnostics?.gotAudio && !alone.diagnostics.gotSpeech) {
    verdict =
      'Le micro est bien ouvert mais aucune parole n\'a été détectée : le niveau d\'entrée est peut-être trop faible, ou le mauvais micro est sélectionné.';
    tone = 'error';
  } else {
    verdict =
      "Le moteur a entendu du son mais n'a rendu aucun texte. Vérifiez la langue de dictée et votre connexion : la reconnaissance vocale de ce navigateur passe par Internet.";
    tone = 'error';
  }

  return (
    <div className="speech-test__verdict" data-tone={tone} role="status">
      <p className="speech-test__verdict-text">{verdict}</p>
      <dl className="speech-test__results">
        <dt>Moteur seul</dt>
        <dd>{alone.text ? `« ${alone.text} »` : (alone.error ?? 'aucun texte')}</dd>
        <dt>Pendant un enregistrement</dt>
        <dd>{withRecorder.text ? `« ${withRecorder.text} »` : (withRecorder.error ?? 'aucun texte')}</dd>
      </dl>
      {/* Détail technique : utile pour signaler un problème. */}
      <details className="speech-test__details">
        <summary>Détail technique</summary>
        <p>Seul — {summarize(alone)}</p>
        <p>Avec enregistrement — {summarize(withRecorder)}</p>
        <p className="speech-test__trail">
          {(alone.diagnostics?.events ?? [])
            .map((event) => `${event.at}ms ${event.name}`)
            .join(' → ') || 'aucun événement'}
        </p>
      </details>
    </div>
  );
}
