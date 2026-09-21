import { useCallback, useEffect, useState } from 'react';
import {
  LANGUAGE_OPTIONS,
  RETENTION_OPTIONS,
  type RecordingMode,
  type RetentionDays,
  type Settings,
} from '../types/settings';
import {
  exportNotesAsJson,
  getStorageStats,
  type PurgeResult,
  type StorageStats,
} from '../services/storage/notes-repository';
import { formatBytes } from '../utils/format';
import { DownloadIcon, LockIcon } from './Icons';
import { Modal } from './Modal';
import { SpeechTest } from './SpeechTest';

interface SettingsPanelProps {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onClose: () => void;
  onPurgeExpired: () => Promise<PurgeResult>;
  onNotify: (message: string, tone?: 'info' | 'success' | 'error') => void;
  speechSupported: boolean;
  speechProviderName?: string;
  variant: 'mobile' | 'desktop';
}

export function SettingsPanel({
  settings,
  onChange,
  onClose,
  onPurgeExpired,
  onNotify,
  speechSupported,
  speechProviderName,
  variant,
}: SettingsPanelProps) {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshStats = useCallback(async () => {
    try {
      setStats(await getStorageStats());
    } catch {
      setStats(null);
    }
  }, []);

  // Changer la durée de conservation peut supprimer des audios : les chiffres
  // affichés juste au-dessus doivent suivre.
  useEffect(() => {
    void refreshStats();
  }, [refreshStats, settings.audioRetentionDays]);

  const handlePurge = async () => {
    setBusy(true);
    const result = await onPurgeExpired();
    await refreshStats();
    setBusy(false);
    onNotify(
      result.removed > 0
        ? `${result.removed} audio${result.removed > 1 ? 's' : ''} supprimé${result.removed > 1 ? 's' : ''} (${formatBytes(result.freedBytes)} libérés).`
        : 'Aucun audio expiré à nettoyer.',
      'success',
    );
  };

  const handleExport = async () => {
    setBusy(true);
    try {
      const json = await exportNotesAsJson();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `voice-notes-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Laisse au navigateur le temps de démarrer le téléchargement.
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      onNotify('Export JSON téléchargé.', 'success');
    } catch {
      onNotify("L'export de vos notes a échoué.", 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Paramètres" onClose={onClose} variant={variant === 'mobile' ? 'sheet' : 'dialog'}>
      <div className="settings">
        <section className="settings__section">
          <h3 className="settings__title">Enregistrement</h3>
          <fieldset className="settings__fieldset">
            <legend className="visually-hidden">Mode d'enregistrement</legend>
            {(
              [
                {
                  value: 'toggle',
                  label: 'Appuyer pour démarrer / appuyer pour arrêter',
                  hint: 'Recommandé',
                },
                { value: 'hold', label: 'Maintenir pour enregistrer', hint: 'Relâcher pour arrêter' },
              ] as { value: RecordingMode; label: string; hint: string }[]
            ).map((option) => (
              <label key={option.value} className="settings__radio">
                <input
                  type="radio"
                  name="recording-mode"
                  value={option.value}
                  checked={settings.recordingMode === option.value}
                  onChange={() => onChange({ recordingMode: option.value })}
                />
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.hint}</small>
                </span>
              </label>
            ))}
          </fieldset>
        </section>

        <section className="settings__section">
          <h3 className="settings__title">Audio</h3>
          <label className="settings__row" htmlFor="retention">
            <span>
              <strong>Conservation des audios</strong>
              <small>Passé ce délai, l'audio est supprimé mais la note et sa transcription restent.</small>
            </span>
            <select
              id="retention"
              value={settings.audioRetentionDays}
              onChange={(event) =>
                onChange({ audioRetentionDays: Number(event.target.value) as RetentionDays })
              }
            >
              {RETENTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="settings__section">
          <h3 className="settings__title">Transcription</h3>
          <label className="settings__row settings__row--switch" htmlFor="auto-transcribe">
            <span>
              <strong>Transcription automatique</strong>
              <small>
                {speechSupported
                  ? `Moteur utilisé : ${speechProviderName ?? 'navigateur'}.`
                  : "Indisponible dans ce navigateur : l'enregistrement audio fonctionne quand même."}
              </small>
            </span>
            <input
              id="auto-transcribe"
              type="checkbox"
              role="switch"
              checked={settings.autoTranscribe}
              disabled={!speechSupported}
              onChange={(event) => onChange({ autoTranscribe: event.target.checked })}
            />
          </label>

          <label className="settings__row" htmlFor="language">
            <span>
              <strong>Langue de dictée</strong>
              <small>Utilisée par le moteur de reconnaissance vocale.</small>
            </span>
            <select
              id="language"
              value={settings.language}
              onChange={(event) => onChange({ language: event.target.value })}
            >
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {speechSupported && (
            <>
              <p className="settings__muted">
                Vos notes ressortent vides ? Ce test écoute deux fois — le moteur seul, puis
                pendant un enregistrement — et indique précisément ce qui bloque.
              </p>
              <SpeechTest providerId={settings.speechProviderId} lang={settings.language} />
            </>
          )}
        </section>

        <section className="settings__section">
          <h3 className="settings__title">Stockage local</h3>
          {stats ? (
            <ul className="settings__stats">
              <li>
                <span>Notes</span>
                <strong>{stats.noteCount}</strong>
              </li>
              <li>
                <span>Audios</span>
                <strong>{stats.audioCount}</strong>
              </li>
              <li>
                <span>Espace audio estimé</span>
                <strong>{formatBytes(stats.audioBytes)}</strong>
              </li>
              {stats.expiredAudioCount > 0 && (
                <li>
                  <span>Audios expirés à nettoyer</span>
                  <strong>{stats.expiredAudioCount}</strong>
                </li>
              )}
              {stats.quotaUsage !== undefined && stats.quotaTotal !== undefined && (
                <li>
                  <span>Espace utilisé par le site</span>
                  <strong>
                    {formatBytes(stats.quotaUsage)} / {formatBytes(stats.quotaTotal)}
                  </strong>
                </li>
              )}
            </ul>
          ) : (
            <p className="settings__muted">Statistiques indisponibles.</p>
          )}
          <p className="settings__muted">Estimation de l'espace utilisé.</p>
          <button type="button" className="button button--ghost" onClick={() => void handlePurge()} disabled={busy}>
            Nettoyer les audios expirés
          </button>
        </section>

        <section className="settings__section">
          <h3 className="settings__title">Export</h3>
          <p className="settings__muted">
            Export JSON des transcriptions et des métadonnées. Les fichiers audio restent dans ce
            navigateur.
          </p>
          <button type="button" className="button button--ghost" onClick={() => void handleExport()} disabled={busy}>
            <DownloadIcon size={16} /> Exporter mes notes
          </button>
        </section>

        <section className="settings__section settings__section--privacy">
          <h3 className="settings__title">
            <LockIcon size={16} /> Confidentialité
          </h3>
          <p className="settings__muted">
            Vos notes sont stockées localement dans ce navigateur. Rien n'est envoyé à un serveur par
            cette application, et le microphone n'est activé que pendant un enregistrement lancé par
            vous.
          </p>
          <p className="settings__muted">
            À noter : la transcription du navigateur (Web Speech API) peut, selon le navigateur,
            traiter l'audio en ligne. Désactivez la transcription automatique pour rester 100 % hors
            ligne.
          </p>
        </section>
      </div>
    </Modal>
  );
}
