/**
 * Enregistrement du service worker.
 *
 * Uniquement en production : en développement, un service worker qui met en
 * cache la coquille masquerait les modifications à chaud.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    const base = import.meta.env.BASE_URL || '/';
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => {
      // Sans service worker l'application fonctionne toujours : simplement pas
      // hors ligne. Aucun message à afficher à l'utilisateur.
    });
  });
}
