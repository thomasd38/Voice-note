import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Base path.
 *
 * GitHub Pages sert le site depuis https://<user>.github.io/<repo>/ : le base
 * path doit donc contenir le nom du dépôt. Le workflow GitHub Actions injecte
 * `VITE_BASE_PATH` à partir du nom réel du dépôt, ce qui évite de coder en dur
 * une casse ou un nom qui pourrait changer. En local, `/` suffit.
 */
const base = normalizeBase(process.env.VITE_BASE_PATH ?? '/');

function normalizeBase(value: string): string {
  if (!value || value === '/') return '/';
  const trimmed = value.replace(/^\/+|\/+$/g, '');
  return trimmed ? `/${trimmed}/` : '/';
}

/**
 * Génère le service worker à partir de `src/sw/service-worker.js`.
 *
 * Plutôt que d'ajouter une dépendance PWA complète (vite-plugin-pwa), on
 * injecte simplement la liste des assets produits par le build et une version
 * de cache dans un service worker écrit à la main : c'est ~60 lignes, sans
 * dépendance, et le comportement reste totalement lisible.
 */
function serviceWorkerPlugin(): Plugin {
  let isBuild = false;
  return {
    name: 'voice-notes-service-worker',
    configResolved(config) {
      isBuild = config.command === 'build';
    },
    async generateBundle(_options, bundle) {
      if (!isBuild) return;

      const source = await import('node:fs/promises').then((fs) =>
        fs.readFile(new URL('./src/sw/service-worker.js', import.meta.url), 'utf8'),
      );

      const assets = Object.values(bundle)
        .map((chunk) => `${base}${chunk.fileName}`)
        // Les sourcemaps et le manifest n'ont pas besoin d'être préchargés.
        .filter((file) => !file.endsWith('.map'));

      const precache = Array.from(new Set([base, `${base}index.html`, `${base}manifest.webmanifest`, ...assets]));
      const version = `v1-${Date.now().toString(36)}`;

      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: source
          .replace('__CACHE_VERSION__', version)
          .replace('"__PRECACHE_ASSETS__"', JSON.stringify(precache, null, 2))
          .replace('__BASE_PATH__', base),
      });
    },
  };
}

export default defineConfig({
  base,
  plugins: [react(), serviceWorkerPlugin()],
  build: {
    target: 'es2020',
    sourcemap: false,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
