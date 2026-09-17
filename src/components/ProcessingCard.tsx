interface ProcessingCardProps {
  /** Transcription provisoire captée pendant l'enregistrement. */
  liveTranscript?: string;
}

/**
 * Carte affichée pendant le traitement d'un enregistrement qui vient de
 * s'arrêter : l'utilisateur voit immédiatement que « quelque chose arrive »
 * avant que la note réelle ne s'insère en haut de la liste.
 */
export function ProcessingCard({ liveTranscript }: ProcessingCardProps) {
  return (
    <article className="note-card note-card--processing" aria-live="polite">
      <div className="note-card__main">
        <h3 className="note-card__title">
          <span className="spinner" aria-hidden="true" /> Nouvelle note
        </h3>
        <p className="note-card__excerpt">
          {liveTranscript ? `« ${liveTranscript} »` : 'Transcription en cours…'}
        </p>
      </div>
    </article>
  );
}
