/**
 * Registre des moteurs de transcription.
 *
 * Point d'extension unique de la V4 (« Whisper / IA ») : il suffira d'ajouter
 *
 *   register(new WhisperProvider());
 *
 * et le provider apparaîtra dans les paramètres. Le reste de l'application
 * (hooks, composants, base de données) n'a pas à changer.
 */

import type { SpeechToTextProvider } from './types';
import { WebSpeechProvider } from './web-speech-provider';

const providers = new Map<string, SpeechToTextProvider>();

export function registerProvider(provider: SpeechToTextProvider): void {
  providers.set(provider.id, provider);
}

registerProvider(new WebSpeechProvider());

export function getProvider(id: string): SpeechToTextProvider | undefined {
  return providers.get(id);
}

export function listProviders(): SpeechToTextProvider[] {
  return Array.from(providers.values());
}

/** Premier provider réellement utilisable dans ce navigateur, sinon `undefined`. */
export function getSupportedProvider(preferredId?: string): SpeechToTextProvider | undefined {
  const preferred = preferredId ? providers.get(preferredId) : undefined;
  if (preferred?.isSupported()) return preferred;
  return listProviders().find((provider) => provider.isSupported());
}

/** `true` si un provider peut re-transcrire un audio déjà enregistré. */
export function canRetranscribe(provider: SpeechToTextProvider | undefined): boolean {
  return Boolean(provider && provider.mode === 'batch' && typeof provider.transcribe === 'function');
}
