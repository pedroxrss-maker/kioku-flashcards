// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Capture how importApkg is invoked. It's loaded via dynamic import() inside the
// component, which vi.mock intercepts too.
const importApkg = vi.fn(async () => ({
  deckId: 'd1',
  deckName: 'X',
  deckCount: 1,
  cardCount: 0,
  mediaCount: 0,
  warnings: [],
}));
vi.mock('./apkg-import', () => ({ importApkg }));

import { ImportButton } from './ImportButton';

describe('ImportButton file read', () => {
  beforeEach(() => importApkg.mockClear());

  it('reads the file into a buffer immediately and parses from that buffer (no File reference)', async () => {
    const { container } = render(
      <MemoryRouter>
        <ImportButton />
      </MemoryRouter>,
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    const file = new File([new Uint8Array([1, 2, 3, 4])], 'Big Deck.colpkg');
    // Capture-immediately means file.arrayBuffer() is read before importApkg.
    const spy = vi.spyOn(file, 'arrayBuffer');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));

    await waitFor(() => expect(importApkg).toHaveBeenCalledTimes(1));
    expect(spy).toHaveBeenCalled(); // the bytes were read up front
    const [data, name] = importApkg.mock.calls[0] as unknown as [unknown, string];
    expect(data).toBeInstanceOf(Uint8Array); // parsed from the in-memory buffer
    expect(name).toBe('Big Deck.colpkg');
  });

  it('falls back to FileReader when arrayBuffer() fails (large/cloud files)', async () => {
    const { container } = render(
      <MemoryRouter>
        <ImportButton />
      </MemoryRouter>,
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    const file = new File([new Uint8Array([5, 6, 7, 8])], 'Sub::Deck.colpkg');
    // Blob.arrayBuffer throws (NotReadableError); the FileReader path still works.
    vi.spyOn(file, 'arrayBuffer').mockRejectedValue(new Error('could not be read'));
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));

    await waitFor(() => expect(importApkg).toHaveBeenCalledTimes(1));
    const [data] = importApkg.mock.calls[0] as unknown as [Uint8Array];
    expect(data).toBeInstanceOf(Uint8Array);
    expect(Array.from(data)).toEqual([5, 6, 7, 8]); // recovered via FileReader
  });

  it('shows a local-folder / cloud-sync hint only when every read strategy fails', async () => {
    // Make FileReader always error too, so no strategy can read the file.
    class FailingFileReader {
      error = new Error('NotReadableError');
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsArrayBuffer() {
        setTimeout(() => this.onerror?.(), 0);
      }
    }
    vi.stubGlobal('FileReader', FailingFileReader);

    const { container, findByText } = render(
      <MemoryRouter>
        <ImportButton />
      </MemoryRouter>,
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    const file = new File([new Uint8Array([1])], 'stale.colpkg');
    vi.spyOn(file, 'arrayBuffer').mockRejectedValue(new Error('could not be read'));
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));

    expect(await findByText(/pasta local/i)).toBeTruthy();
    expect(importApkg).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
