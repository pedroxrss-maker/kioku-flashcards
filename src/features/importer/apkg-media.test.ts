import { describe, expect, it } from 'vitest';
import { parseMediaEntries } from './apkg-import';

// Encode a protobuf MediaEntries message the way Anki's v3 `media` manifest does:
//   MediaEntries { repeated MediaEntry entries = 1 }
//   MediaEntry   { string name = 1; uint32 size = 2 }
function encodeEntry(name: string, size: number): number[] {
  const nameBytes = [...new TextEncoder().encode(name)];
  // field 1 (name, len-delimited) + field 2 (size, varint; kept < 128 here)
  return [0x0a, nameBytes.length, ...nameBytes, 0x10, size];
}
function encodeEntries(items: Array<[string, number]>): Uint8Array {
  const out: number[] = [];
  for (const [name, size] of items) {
    const entry = encodeEntry(name, size);
    out.push(0x0a, entry.length, ...entry); // field 1 of MediaEntries
  }
  return new Uint8Array(out);
}

describe('parseMediaEntries (v3 protobuf media manifest)', () => {
  it('extracts filenames in order (index = zip member name)', () => {
    // Sizes kept < 128 so each encodes as a single-byte varint in this helper.
    const buf = encodeEntries([
      ['cat.jpg', 100],
      ['dog.png', 42],
      [' separator name .webp', 7],
    ]);
    expect(parseMediaEntries(buf)).toEqual(['cat.jpg', 'dog.png', ' separator name .webp']);
  });

  it('returns an empty list for an empty manifest', () => {
    expect(parseMediaEntries(new Uint8Array([]))).toEqual([]);
  });
});
