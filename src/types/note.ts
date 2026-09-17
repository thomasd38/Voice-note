/**
 * Modèle de données de l'application.
 *
 * Deux entités distinctes sont stockées dans IndexedDB :
 *  - `Note`  : les métadonnées + la transcription (légères, toujours chargées) ;
 *  - `AudioRecord` : le Blob audio (lourd, chargé à la demande, supprimé à
 *    l'expiration sans jamais toucher à la note).
 *
 * Cette séparation est ce qui permet de « supprimer l'audio, garder la note »
 * sans réécrire l'enregistrement complet, et d'afficher la liste des notes sans
 * charger des dizaines de mégaoctets d'audio en mémoire.
 */

export type TranscriptionStatus =
  /** La transcription est en cours (ou en attente de traitement). */
  | 'pending'
  /** Une transcription est disponible. */
  | 'completed'
  /** La transcription a échoué : l'audio reste disponible. */
  | 'error'
  /** Le navigateur (ou les réglages) ne permet pas de transcrire. */
  | 'unavailable';

export interface Note {
  id: string;
  createdAt: number;
  updatedAt: number;
  /** Titre court dérivé de la première phrase, éditable indirectement via la transcription. */
  title: string;
  transcription: string;
  transcriptionStatus: TranscriptionStatus;
  /** Message d'erreur déjà traduit pour l'utilisateur (jamais un code technique brut). */
  transcriptionError?: string;
  /** Identifiant du provider STT utilisé (utile quand on ajoutera Whisper). */
  transcriptionProvider?: string;
  /** Langue demandée lors de la transcription, ex. `fr-FR`. */
  language?: string;
  /** `true` tant que le Blob associé existe dans le store `audio`. */
  hasAudio: boolean;
  audioMimeType?: string;
  /** Durée en secondes. */
  audioDuration?: number;
  /** Taille du Blob en octets (conservée après suppression pour l'affichage). */
  audioSize?: number;
  /**
   * Date d'expiration de l'audio (timestamp ms).
   * `null` = conservation illimitée ; `undefined` = pas d'audio.
   */
  audioExpiresAt?: number | null;
  /** Renseigné quand l'audio a été supprimé (expiration ou nettoyage manuel). */
  audioDeletedAt?: number;
  /** L'utilisateur a modifié la transcription à la main. */
  edited?: boolean;
}

export interface AudioRecord {
  /** Même identifiant que la note : relation 1-1. */
  noteId: string;
  /**
   * Contenu audio brut.
   *
   * On stocke un `ArrayBuffer` plutôt que le `Blob` lui-même : toutes les
   * implémentations d'IndexedDB le gèrent (le stockage de Blob a longtemps été
   * défaillant sur Safari) et le `Blob` est reconstruit à la lecture avec son
   * type MIME, sans perte.
   */
  data: ArrayBuffer;
  mimeType: string;
  createdAt: number;
  size: number;
  /** Dupliqué ici pour pouvoir indexer l'expiration côté audio. */
  expiresAt: number | null;
}

/** Données nécessaires à la création d'une note après un enregistrement. */
export interface NoteDraft {
  audioBlob?: Blob;
  mimeType?: string;
  duration?: number;
  transcription?: string;
  transcriptionStatus: TranscriptionStatus;
  transcriptionError?: string;
  transcriptionProvider?: string;
  language?: string;
}
