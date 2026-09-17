import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../types/settings';
import { clearSettings, loadSettings, sanitizeSettings, saveSettings } from './settings-store';

describe('paramètres par défaut', () => {
  it('utilise « appuyer pour démarrer », 7 jours, transcription auto en français', () => {
    expect(DEFAULT_SETTINGS.recordingMode).toBe('toggle');
    expect(DEFAULT_SETTINGS.audioRetentionDays).toBe(7);
    expect(DEFAULT_SETTINGS.autoTranscribe).toBe(true);
    expect(DEFAULT_SETTINGS.language).toBe('fr-FR');
  });

  it('renvoie les valeurs par défaut quand rien n\'est stocké', () => {
    clearSettings();
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});

describe('persistance', () => {
  it('relit ce qui a été enregistré', () => {
    saveSettings({ ...DEFAULT_SETTINGS, recordingMode: 'hold', audioRetentionDays: 30 });
    const loaded = loadSettings();
    expect(loaded.recordingMode).toBe('hold');
    expect(loaded.audioRetentionDays).toBe(30);
  });

  it('retombe sur les valeurs par défaut si le contenu est corrompu', () => {
    localStorage.setItem('voice-notes:settings', '{ pas du json');
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});

describe('sanitizeSettings', () => {
  it('rejette les valeurs invalides champ par champ', () => {
    const result = sanitizeSettings({
      recordingMode: 'maintenir',
      audioRetentionDays: 99,
      autoTranscribe: 'oui',
      language: '',
      speechProviderId: 42,
    });
    expect(result).toEqual(DEFAULT_SETTINGS);
  });

  it('conserve les valeurs valides', () => {
    const result = sanitizeSettings({
      recordingMode: 'hold',
      audioRetentionDays: 1,
      autoTranscribe: false,
      language: 'en-US',
      speechProviderId: 'web-speech',
    });
    expect(result).toEqual({
      recordingMode: 'hold',
      audioRetentionDays: 1,
      autoTranscribe: false,
      language: 'en-US',
      speechProviderId: 'web-speech',
    });
  });

  it('accepte « Toujours » (0 jour) comme durée de conservation', () => {
    expect(sanitizeSettings({ audioRetentionDays: 0 }).audioRetentionDays).toBe(0);
  });

  it('accepte n\'importe quelle entrée sans lever d\'erreur', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('texte')).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });
});
