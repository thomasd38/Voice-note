import { describe, expect, it } from 'vitest';
import { deriveTitle, highlightSegments, matchesQuery, normalizeForSearch } from './text';

describe('normalizeForSearch', () => {
  it('supprime les accents et la casse', () => {
    expect(normalizeForSearch('École')).toBe('ecole');
    expect(normalizeForSearch('  Padel  ')).toBe('padel');
    expect(normalizeForSearch('Où çà ?')).toBe('ou ca ?');
  });
});

describe('matchesQuery', () => {
  const note = "Il faut que je pense à acheter des balles de padel avant samedi à l'école.";

  it('trouve un mot quelle que soit la casse', () => {
    expect(matchesQuery(note, 'PADEL')).toBe(true);
    expect(matchesQuery(note, 'padel')).toBe(true);
  });

  it('tolère les accents dans les deux sens', () => {
    expect(matchesQuery(note, 'ecole')).toBe(true);
    expect(matchesQuery(note, 'école')).toBe(true);
    expect(matchesQuery('Reunion de rentree', 'réunion')).toBe(true);
  });

  it('exige tous les mots de la recherche, dans n\'importe quel ordre', () => {
    expect(matchesQuery(note, 'balles padel')).toBe(true);
    expect(matchesQuery(note, 'padel balles')).toBe(true);
    expect(matchesQuery(note, 'padel tennis')).toBe(false);
  });

  it('accepte tout quand la recherche est vide', () => {
    expect(matchesQuery(note, '')).toBe(true);
    expect(matchesQuery(note, '   ')).toBe(true);
  });

  it('renvoie faux quand le terme est absent', () => {
    expect(matchesQuery(note, 'raquette')).toBe(false);
  });
});

describe('deriveTitle', () => {
  it('prend la première phrase', () => {
    expect(deriveTitle('Acheter des balles. Puis réserver le terrain.')).toBe(
      'Acheter des balles',
    );
  });

  it('tronque proprement les phrases très longues', () => {
    const title = deriveTitle(
      'Ceci est une phrase particulièrement longue qui dépasse largement la limite autorisée pour un titre de note',
    );
    expect(title.length).toBeLessThanOrEqual(61);
    expect(title.endsWith('…')).toBe(true);
  });

  it('renvoie une chaîne vide pour une transcription vide', () => {
    expect(deriveTitle('')).toBe('');
    expect(deriveTitle('   ')).toBe('');
  });

  it('normalise les espaces et les retours à la ligne', () => {
    expect(deriveTitle('  Note   avec\nespaces  ')).toBe('Note avec espaces');
  });
});

describe('highlightSegments', () => {
  it('marque les occurrences même accentuées', () => {
    const segments = highlightSegments("Réunion à l'école", 'ecole');
    const highlighted = segments.filter((segment) => segment.match).map((segment) => segment.text);
    expect(highlighted).toEqual(['école']);
  });

  it('renvoie un seul segment sans recherche', () => {
    expect(highlightSegments('Texte', '')).toEqual([{ text: 'Texte', match: false }]);
  });

  it('préserve le texte d\'origine', () => {
    const text = "Des balles de padel avant samedi";
    expect(
      highlightSegments(text, 'padel')
        .map((segment) => segment.text)
        .join(''),
    ).toBe(text);
  });
});
