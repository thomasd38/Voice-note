import { useCallback, useEffect, useRef, useState } from 'react';
import { formatDuration } from '../utils/format';
import { PauseIcon, PlayIcon } from './Icons';

interface AudioPlayerProps {
  noteId: string;
  /** Durée mesurée à l'enregistrement : les Blobs WebM annoncent souvent `Infinity`. */
  duration?: number;
  variant?: 'compact' | 'full';
  loadAudioUrl: (noteId: string) => Promise<string | null>;
}

const SPEEDS = [1, 1.5, 2] as const;

/**
 * Audio en cours de lecture, tous lecteurs confondus.
 *
 * La liste affiche un lecteur par carte : sans ce verrou, lancer une note puis
 * une autre les ferait jouer en même temps. Démarrer un lecteur met donc en
 * pause le précédent, dont l'événement `pause` remet l'état à jour.
 */
let activeAudio: HTMLAudioElement | null = null;

/**
 * Lecteur audio minimal maison.
 *
 * Le lecteur natif est laid et incohérent d'un navigateur à l'autre ; celui-ci
 * tient en une barre de progression, un bouton et une vitesse de lecture.
 * Le Blob n'est chargé depuis IndexedDB qu'au premier appui sur « Lire » :
 * afficher une liste de 100 notes ne crée pas 100 URLs d'objets.
 */
export function AudioPlayer({ noteId, duration, variant = 'full', loadAudioUrl }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration ?? 0);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [error, setError] = useState<string | null>(null);

  // Une nouvelle note sélectionnée = on repart de zéro.
  useEffect(() => {
    setPlaying(false);
    setCurrentTime(0);
    setTotalDuration(duration ?? 0);
    setError(null);
    if (audioRef.current) {
      audioRef.current.pause();
      if (activeAudio === audioRef.current) activeAudio = null;
      audioRef.current = null;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }, [noteId, duration]);

  // Libération de l'URL d'objet au démontage : sinon le Blob reste en mémoire.
  useEffect(
    () => () => {
      audioRef.current?.pause();
      if (activeAudio === audioRef.current) activeAudio = null;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    },
    [],
  );

  const ensureAudio = useCallback(async (): Promise<HTMLAudioElement | null> => {
    if (audioRef.current) return audioRef.current;

    setLoading(true);
    try {
      const url = await loadAudioUrl(noteId);
      if (!url) {
        setError("Cet audio n'est plus disponible.");
        return null;
      }
      urlRef.current = url;
      const audio = new Audio(url);
      audio.preload = 'metadata';
      audio.playbackRate = speed;
      audio.onloadedmetadata = () => {
        if (Number.isFinite(audio.duration) && audio.duration > 0) setTotalDuration(audio.duration);
      };
      audio.ontimeupdate = () => setCurrentTime(audio.currentTime);
      // Couvre aussi la pause imposée par un autre lecteur (voir `activeAudio`).
      audio.onpause = () => setPlaying(false);
      audio.onended = () => {
        setPlaying(false);
        setCurrentTime(0);
        audio.currentTime = 0;
      };
      audio.onerror = () => {
        setError("Cet audio n'a pas pu être lu : le fichier semble endommagé.");
        setPlaying(false);
      };
      audioRef.current = audio;
      return audio;
    } catch {
      setError("Cet audio n'a pas pu être chargé.");
      return null;
    } finally {
      setLoading(false);
    }
  }, [loadAudioUrl, noteId, speed]);

  const toggle = useCallback(async () => {
    const audio = await ensureAudio();
    if (!audio) return;
    if (audio.paused) {
      if (activeAudio && activeAudio !== audio) activeAudio.pause();
      activeAudio = audio;
      try {
        await audio.play();
        setPlaying(true);
        setError(null);
      } catch {
        setError("La lecture a été bloquée par le navigateur. Appuyez à nouveau sur lecture.");
        setPlaying(false);
      }
    } else {
      audio.pause();
      setPlaying(false);
    }
  }, [ensureAudio]);

  const handleSeek = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    setCurrentTime(value);
    if (audioRef.current) audioRef.current.currentTime = value;
  }, []);

  const cycleSpeed = useCallback(() => {
    setSpeed((current) => {
      const next = SPEEDS[(SPEEDS.indexOf(current) + 1) % SPEEDS.length];
      if (audioRef.current) audioRef.current.playbackRate = next;
      return next;
    });
  }, []);

  if (error) {
    return (
      <p className="audio-player__error" role="status">
        {error}
      </p>
    );
  }

  const max = totalDuration > 0 ? totalDuration : 0;
  // Avant la première lecture, la position « 0:00 » n'apporte rien : la
  // version compacte n'affiche alors que la durée, comme un badge.
  const started = playing || currentTime > 0;

  return (
    <div className={`audio-player audio-player--${variant}`}>
      <button
        type="button"
        className="audio-player__play"
        onClick={(event) => {
          // Dans une carte cliquable, le bouton ne doit pas ouvrir la note.
          event.stopPropagation();
          void toggle();
        }}
        aria-label={playing ? 'Mettre en pause' : "Écouter l'enregistrement"}
        disabled={loading}
      >
        {playing ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
      </button>

      <input
        type="range"
        className="audio-player__progress"
        min={0}
        max={max || 1}
        step={0.1}
        value={Math.min(currentTime, max || 1)}
        onChange={handleSeek}
        aria-label="Position de lecture"
        aria-valuetext={`${formatDuration(currentTime)} sur ${formatDuration(max)}`}
        disabled={max === 0}
      />

      {variant === 'full' ? (
        <>
          <span className="audio-player__time" aria-hidden="true">
            {formatDuration(currentTime)} / {formatDuration(max)}
          </span>
          <button
            type="button"
            className="audio-player__speed"
            onClick={cycleSpeed}
            aria-label={`Vitesse de lecture : ${speed}×. Changer de vitesse.`}
          >
            {speed}×
          </button>
        </>
      ) : (
        <span className="audio-player__time" aria-hidden="true">
          {started ? `${formatDuration(currentTime)} / ` : ''}
          {formatDuration(max || duration)}
        </span>
      )}
    </div>
  );
}
