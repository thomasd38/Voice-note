/**
 * Génère les icônes PNG de la PWA dans `public/`.
 *
 * Script de développement lancé à la main (`node scripts/generate-icons.mjs`),
 * pas au build : les icônes sont versionnées. Il encode le PNG lui-même avec
 * `zlib` plutôt que d'ajouter une dépendance graphique au projet.
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(ROOT, 'public');

const BACKGROUND = [79, 70, 229]; // #4F46E5
const FOREGROUND = [255, 255, 255];
const SUPERSAMPLE = 4;

/* --- Encodage PNG minimal (RGBA, 8 bits) ---------------------------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // profondeur
  header[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0; // filtre « None »
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* --- Dessin de l'icône ---------------------------------------------------- */

/** Distance signée à un rectangle arrondi centré en (cx, cy). */
function insideRoundedRect(x, y, cx, cy, halfW, halfH, radius) {
  const dx = Math.abs(x - cx) - (halfW - radius);
  const dy = Math.abs(y - cy) - (halfH - radius);
  if (dx <= 0 || dy <= 0) return Math.abs(x - cx) <= halfW && Math.abs(y - cy) <= halfH;
  return dx * dx + dy * dy <= radius * radius;
}

/**
 * Icône : carré arrondi coloré + micro blanc (capsule, arc, pied).
 * `padding` sert aux icônes « maskable », dont les bords peuvent être rognés.
 */
function drawIcon(size, { padding = 0, roundedBackground = true } = {}) {
  const S = size * SUPERSAMPLE;
  const pixels = Buffer.alloc(size * size * 4);
  const pad = padding * SUPERSAMPLE;
  const inner = S - pad * 2;
  const cx = S / 2;

  // Géométrie du micro, exprimée en fraction de la zone utile.
  const bodyHalfW = inner * 0.115;
  const bodyHalfH = inner * 0.2;
  const bodyCy = pad + inner * 0.38;
  const arcOuter = inner * 0.255;
  const arcInner = arcOuter - inner * 0.055;
  const arcCy = bodyCy + inner * 0.06;
  const stemTop = arcCy + arcInner;
  const stemBottom = pad + inner * 0.82;
  const baseHalfW = inner * 0.155;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let bgHits = 0;
      let fgHits = 0;

      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const px = x * SUPERSAMPLE + sx + 0.5;
          const py = y * SUPERSAMPLE + sy + 0.5;

          const inBackground = roundedBackground
            ? insideRoundedRect(px, py, S / 2, S / 2, S / 2, S / 2, S * 0.22)
            : true;
          if (inBackground) bgHits += 1;

          const inBody = insideRoundedRect(px, py, cx, bodyCy, bodyHalfW, bodyHalfH, bodyHalfW);
          const dx = px - cx;
          const dy = py - arcCy;
          const dist = Math.hypot(dx, dy);
          const inArc = dy >= 0 && dist <= arcOuter && dist >= arcInner;
          const inStem = Math.abs(dx) <= inner * 0.028 && py >= stemTop && py <= stemBottom;
          const inBase =
            insideRoundedRect(px, py, cx, stemBottom, baseHalfW, inner * 0.028, inner * 0.028);

          if (inBackground && (inBody || inArc || inStem || inBase)) fgHits += 1;
        }
      }

      const total = SUPERSAMPLE * SUPERSAMPLE;
      const bgAlpha = bgHits / total;
      const fgAlpha = fgHits / total;
      const offset = (y * size + x) * 4;
      // Composition : avant-plan blanc sur fond indigo, le tout sur du transparent.
      for (let c = 0; c < 3; c += 1) {
        const color = BACKGROUND[c] * (1 - fgAlpha) + FOREGROUND[c] * fgAlpha;
        pixels[offset + c] = Math.round(color);
      }
      pixels[offset + 3] = Math.round(Math.max(bgAlpha, fgAlpha) * 255);
    }
  }

  return encodePng(size, size, pixels);
}

mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  { file: 'icon-192.png', size: 192, options: {} },
  { file: 'icon-512.png', size: 512, options: {} },
  // « Maskable » : 20 % de marge pour survivre au rognage d'Android.
  { file: 'icon-maskable-512.png', size: 512, options: { padding: 102, roundedBackground: false } },
  { file: 'apple-touch-icon.png', size: 180, options: { roundedBackground: false } },
];

for (const target of targets) {
  const png = drawIcon(target.size, target.options);
  writeFileSync(resolve(OUT_DIR, target.file), png);
  console.log(`${target.file} — ${(png.length / 1024).toFixed(1)} Ko`);
}
