import { describe, expect, it } from 'vitest';
import { formatBytes, formatDuration, formatExpiry, formatNoteDate, groupKeyFor } from './format';

const DAY = 24 * 60 * 60 * 1000;

describe('formatDuration', () => {
  it('formate en mm:ss', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(32)).toBe('00:32');
    expect(formatDuration(75.8)).toBe('01:15');
  });

  it('passe en h:mm:ss au-delà d\'une heure', () => {
    expect(formatDuration(3723)).toBe('1:02:03');
  });

  it('résiste aux valeurs invalides', () => {
    expect(formatDuration(undefined)).toBe('00:00');
    expect(formatDuration(Number.NaN)).toBe('00:00');
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('00:00');
    expect(formatDuration(-4)).toBe('00:00');
  });
});

describe('formatBytes', () => {
  it('utilise le séparateur décimal français', () => {
    expect(formatBytes(0)).toBe('0 octet');
    expect(formatBytes(512)).toBe('512 octets');
    expect(formatBytes(1024)).toBe('1 Ko');
    expect(formatBytes(19_293_798)).toBe('18,4 Mo');
  });
});

describe('groupKeyFor', () => {
  const now = new Date('2026-03-10T15:00:00').getTime();

  it('classe par période', () => {
    expect(groupKeyFor(now, now)).toBe('today');
    expect(groupKeyFor(now - DAY, now)).toBe('yesterday');
    expect(groupKeyFor(now - 4 * DAY, now)).toBe('week');
    expect(groupKeyFor(now - 40 * DAY, now)).toBe('older');
  });
});

describe('formatNoteDate', () => {
  const now = new Date('2026-03-10T15:00:00').getTime();

  it("préfixe par Aujourd'hui ou Hier", () => {
    expect(formatNoteDate(new Date('2026-03-10T12:41:00').getTime(), now)).toContain("Aujourd'hui");
    expect(formatNoteDate(new Date('2026-03-09T09:05:00').getTime(), now)).toContain('Hier');
    expect(formatNoteDate(new Date('2026-02-02T09:05:00').getTime(), now)).toContain('février');
  });
});

describe('formatExpiry', () => {
  const now = Date.now();

  it('décrit le temps restant', () => {
    expect(formatExpiry(now + 6.5 * DAY, now)).toBe('expire dans 6 jours');
    expect(formatExpiry(now + 3 * 60 * 60 * 1000, now)).toBe('expire dans 3 heures');
    expect(formatExpiry(now + 90_000, now)).toBe('expire dans 1 minute');
  });

  it('gère expiré et illimité', () => {
    expect(formatExpiry(now - 1, now)).toBe('expiré');
    expect(formatExpiry(null, now)).toBe('conservation illimitée');
    expect(formatExpiry(undefined, now)).toBe('');
  });
});
