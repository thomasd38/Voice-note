/* eslint-disable no-restricted-globals */
/**
 * Service worker de Voice Notes.
 *
 * Écrit à la main (les jetons `__…__` sont remplacés au build par le plugin
 * défini dans `vite.config.ts`). Il ne fait qu'une chose : servir la coquille
 * de l'application hors ligne. Aucune donnée utilisateur ne transite ici —
 * les notes vivent dans IndexedDB, jamais dans le cache HTTP.
 */

const CACHE_NAME = 'voice-notes-__CACHE_VERSION__';
const BASE_PATH = '__BASE_PATH__';
const PRECACHE_ASSETS = "__PRECACHE_ASSETS__";

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // `Promise.allSettled` : une ressource manquante ne doit pas faire
      // échouer toute l'installation.
      await Promise.allSettled(PRECACHE_ASSETS.map((asset) => cache.add(asset)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key.startsWith('voice-notes-') && key !== CACHE_NAME).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigation : réseau d'abord (pour récupérer une nouvelle version), repli
  // sur la page en cache quand on est hors ligne.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          const cache = await caches.open(CACHE_NAME);
          cache.put(`${BASE_PATH}index.html`, response.clone());
          return response;
        } catch {
          const cached = await caches.match(`${BASE_PATH}index.html`, { ignoreVary: true });
          return cached ?? Response.error();
        }
      })(),
    );
    return;
  }

  // Assets : cache d'abord (ils sont versionnés par leur nom de fichier).
  event.respondWith(
    (async () => {
      // `ignoreVary` : certains serveurs renvoient « Vary: Origin », et les
      // scripts chargés en `crossorigin` envoient un en-tête `Origin` que
      // l'entrée mise en cache n'a pas — sans cela, rien ne correspondrait
      // hors ligne. Nos assets sont versionnés par leur nom : la variation
      // d'en-tête n'a aucune incidence sur leur contenu.
      const cached = await caches.match(request, { ignoreVary: true });
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok && response.type === 'basic') {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, response.clone());
        }
        return response;
      } catch {
        return cached ?? Response.error();
      }
    })(),
  );
});
