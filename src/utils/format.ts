/** Formatage des durées, dates et tailles pour l'interface (en français). */

/** `00:32`, ou `01:02:03` au-delà d'une heure. */
export function formatDuration(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return '00:00';
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (value: number) => value.toString().padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${pad(minutes)}:${pad(secs)}`;
}

const timeFormatter = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
});

const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
});

const fullDateFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

const DAY_MS = 24 * 60 * 60 * 1000;

export type NoteGroupKey = 'today' | 'yesterday' | 'week' | 'older';

export const GROUP_LABELS: Record<NoteGroupKey, string> = {
  today: "Aujourd'hui",
  yesterday: 'Hier',
  week: 'Cette semaine',
  older: 'Plus ancien',
};

/** Regroupement temporel utilisé par la liste et les filtres. */
export function groupKeyFor(timestamp: number, now: number = Date.now()): NoteGroupKey {
  const today = startOfDay(now);
  if (timestamp >= today) return 'today';
  if (timestamp >= today - DAY_MS) return 'yesterday';
  if (timestamp >= today - 6 * DAY_MS) return 'week';
  return 'older';
}

/** « Aujourd'hui · 12:41 », « Hier · 09:05 », « 3 mars · 18:20 ». */
export function formatNoteDate(timestamp: number, now: number = Date.now()): string {
  const date = new Date(timestamp);
  const group = groupKeyFor(timestamp, now);
  const time = timeFormatter.format(date);
  if (group === 'today') return `Aujourd'hui · ${time}`;
  if (group === 'yesterday') return `Hier · ${time}`;
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  const day = sameYear ? dateFormatter.format(date) : fullDateFormatter.format(date);
  return `${day} · ${time}`;
}

export function formatFullDate(timestamp: number): string {
  const date = new Date(timestamp);
  return `${fullDateFormatter.format(date)} à ${timeFormatter.format(date)}`;
}

/** « 18,4 Mo » — séparateur décimal français. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 octet';
  const units = ['octets', 'Ko', 'Mo', 'Go'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = value >= 100 || unit === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded.toString().replace('.', ',')} ${units[unit]}`;
}

/** « dans 6 jours », « dans 3 heures », « expiré ». */
export function formatExpiry(expiresAt: number | null | undefined, now: number = Date.now()): string {
  if (expiresAt === null) return 'conservation illimitée';
  if (expiresAt === undefined) return '';
  const remaining = expiresAt - now;
  if (remaining <= 0) return 'expiré';
  const days = Math.floor(remaining / DAY_MS);
  if (days >= 1) return `expire dans ${days} jour${days > 1 ? 's' : ''}`;
  const hours = Math.floor(remaining / (60 * 60 * 1000));
  if (hours >= 1) return `expire dans ${hours} heure${hours > 1 ? 's' : ''}`;
  const minutes = Math.max(1, Math.floor(remaining / (60 * 1000)));
  return `expire dans ${minutes} minute${minutes > 1 ? 's' : ''}`;
}
