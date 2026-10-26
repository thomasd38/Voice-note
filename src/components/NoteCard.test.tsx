import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Note } from '../types/note';
import { NoteCard } from './NoteCard';

/**
 * jsdom n'implémente pas la lecture audio : on simule juste ce dont le lecteur
 * dépend — l'état `paused` et l'événement `pause`.
 */
const pausedState = new WeakMap<HTMLMediaElement, boolean>();

beforeEach(() => {
  // jsdom ne fournit pas non plus `URL.revokeObjectURL`, appelé au démontage.
  URL.revokeObjectURL ??= () => {};
  vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    return pausedState.get(this) ?? true;
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
    pausedState.set(this, false);
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
    pausedState.set(this, true);
    this.dispatchEvent(new Event('pause'));
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function makeNote(id: string, overrides: Partial<Note> = {}): Note {
  return {
    id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    title: `Note ${id}`,
    transcription: `Note ${id}`,
    transcriptionStatus: 'completed',
    hasAudio: true,
    audioDuration: 42,
    audioSize: 1000,
    ...overrides,
  };
}

function renderCard(note: Note, onSelect = vi.fn()) {
  return render(
    <NoteCard
      note={note}
      selected={false}
      query=""
      variant="mobile"
      onSelect={onSelect}
      loadAudioUrl={async (id) => `blob:${id}`}
    />,
  );
}

describe('NoteCard', () => {
  it("permet d'écouter la note depuis la liste, sans l'ouvrir", async () => {
    const onSelect = vi.fn();
    renderCard(makeNote('a'), onSelect);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: "Écouter l'enregistrement" }));
    });

    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Mettre en pause' })).toBeTruthy();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("n'affiche pas de lecteur quand l'audio a expiré", () => {
    renderCard(makeNote('a', { hasAudio: false }));

    expect(screen.queryByRole('button', { name: "Écouter l'enregistrement" })).toBeNull();
    expect(screen.getByText('Audio expiré')).toBeTruthy();
  });

  it('met en pause la note précédente quand on en lance une autre', async () => {
    renderCard(makeNote('a'));
    renderCard(makeNote('b'));
    const [first, second] = screen.getAllByRole('button', { name: "Écouter l'enregistrement" });

    await act(async () => {
      fireEvent.click(first);
    });
    await act(async () => {
      fireEvent.click(second);
    });

    // Une seule note joue : l'autre est revenue à « Écouter ».
    expect(screen.getAllByRole('button', { name: 'Mettre en pause' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: "Écouter l'enregistrement" })).toHaveLength(1);
  });
});
