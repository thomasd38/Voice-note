/** Utilitaires texte : normalisation pour la recherche et génération de titres. */

/**
 * Normalise une chaîne pour la recherche : minuscules et suppression des
 * accents (« école » est ainsi trouvé en tapant « ecole », et inversement).
 */
export function normalizeForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** `true` si `haystack` contient tous les mots de `needle` (ordre libre). */
export function matchesQuery(haystack: string, query: string): boolean {
  const normalizedQuery = normalizeForSearch(query);
  if (!normalizedQuery) return true;
  const normalizedHaystack = normalizeForSearch(haystack);
  return normalizedQuery
    .split(/\s+/)
    .every((term) => normalizedHaystack.includes(term));
}

const MAX_TITLE_LENGTH = 60;

/**
 * Dérive un titre lisible à partir de la première phrase de la transcription.
 * Retourne une chaîne vide si la transcription ne contient rien d'exploitable :
 * l'interface affiche alors un libellé par défaut.
 */
export function deriveTitle(transcription: string): string {
  const clean = transcription.replace(/\s+/g, ' ').trim();
  if (!clean) return '';

  const firstSentence = clean.split(/(?<=[.!?…])\s/)[0] ?? clean;
  let title = firstSentence.trim();

  if (title.length > MAX_TITLE_LENGTH) {
    const cut = title.slice(0, MAX_TITLE_LENGTH);
    const lastSpace = cut.lastIndexOf(' ');
    title = `${(lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trim()}…`;
  }

  // Une phrase complète fait un titre plus propre sans son point final.
  return title.replace(/[.]+$/, '');
}

/** Découpe un texte pour mettre en évidence les occurrences de la recherche. */
export function highlightSegments(
  text: string,
  query: string,
): { text: string; match: boolean }[] {
  const normalizedQuery = normalizeForSearch(query);
  if (!normalizedQuery) return [{ text, match: false }];

  const terms = Array.from(new Set(normalizedQuery.split(/\s+/).filter(Boolean)));
  if (terms.length === 0) return [{ text, match: false }];

  // La normalisation NFD peut décaler les index : on normalise caractère par
  // caractère pour garder une correspondance 1-1 avec le texte d'origine.
  const normalizedChars = Array.from(text).map((char) =>
    char
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase(),
  );
  const flat = normalizedChars.join('');
  // Index dans `flat` -> index du caractère d'origine.
  const charIndexes: number[] = [];
  normalizedChars.forEach((normalized, index) => {
    for (let i = 0; i < normalized.length; i += 1) charIndexes.push(index);
  });

  const marks = new Array<boolean>(text.length).fill(false);
  const chars = Array.from(text);
  for (const term of terms) {
    let from = 0;
    for (;;) {
      const found = flat.indexOf(term, from);
      if (found === -1) break;
      for (let i = found; i < found + term.length && i < charIndexes.length; i += 1) {
        marks[charIndexes[i]] = true;
      }
      from = found + term.length;
    }
  }

  const segments: { text: string; match: boolean }[] = [];
  chars.forEach((char, index) => {
    const match = marks[index];
    const last = segments[segments.length - 1];
    if (last && last.match === match) last.text += char;
    else segments.push({ text: char, match });
  });
  return segments;
}
