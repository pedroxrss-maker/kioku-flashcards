import { describe, it, expect } from 'vitest';
import { capDeckCardsResponse } from './index';

/**
 * Unit tests for the server-side per-deck card cap (capDeckCardsResponse). The
 * function is pure (JSON + string handling only), so a plain Node test suffices.
 */

type Card = { type: string; front: string; back: string };

/** A list of `n` distinct, well-formed cards (Q0..Q{n-1}). */
function makeCards(n: number): Card[] {
  return Array.from({ length: n }, (_, i) => ({ type: 'basic', front: `Q${i}`, back: `A${i}` }));
}

/** Wrap a model-output text into the Gemini response shape the Worker proxies. */
function geminiResponse(text: string): unknown {
  return { candidates: [{ content: { role: 'model', parts: [{ text }] } }] };
}

/** Pull the (possibly capped) cards array back out of a response, the way the
 *  app's parseCardsJson does: first "[" to last "]", then JSON.parse. */
function extractCards(resp: unknown): unknown[] {
  const d = resp as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = (d.candidates?.[0]?.content?.parts ?? [])
    .map((p) => (typeof p.text === 'string' ? p.text : ''))
    .join('\n');
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  return JSON.parse(text.slice(start, end + 1)) as unknown[];
}

/** Concatenate the text parts of a response candidate. */
function responseText(resp: unknown): string {
  const d = resp as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return (d.candidates?.[0]?.content?.parts ?? [])
    .map((p) => (typeof p.text === 'string' ? p.text : ''))
    .join('');
}

describe('capDeckCardsResponse', () => {
  it('truncates a response with more cards than the cap to exactly the cap', () => {
    const resp = geminiResponse(JSON.stringify(makeCards(30)));
    const out = capDeckCardsResponse(resp, 20);
    const cards = extractCards(out) as Card[];
    expect(cards).toHaveLength(20);
    // Keeps the FIRST 20 (order preserved), drops the rest.
    expect(cards[0].front).toBe('Q0');
    expect(cards[19].front).toBe('Q19');
  });

  it('parses and caps cards wrapped in ```json code fences', () => {
    const fenced = '```json\n' + JSON.stringify(makeCards(25)) + '\n```';
    const resp = geminiResponse(fenced);
    const out = capDeckCardsResponse(resp, 20);
    const cards = extractCards(out) as Card[];
    expect(cards).toHaveLength(20);
    expect(cards[0].front).toBe('Q0');
    // The capped output is re-serialized as clean JSON (no surrounding fences).
    expect(responseText(out)).not.toContain('```');
  });

  it('passes a response already within the cap through unchanged', () => {
    const resp = geminiResponse(JSON.stringify(makeCards(5)));
    const out = capDeckCardsResponse(resp, 20);
    // Same reference back: nothing was touched.
    expect(out).toBe(resp);
    expect(extractCards(out)).toHaveLength(5);
  });

  it('exactly-at-cap is left unchanged (boundary)', () => {
    const resp = geminiResponse(JSON.stringify(makeCards(20)));
    const out = capDeckCardsResponse(resp, 20);
    expect(out).toBe(resp);
    expect(extractCards(out)).toHaveLength(20);
  });

  it('passes a malformed / unexpected-shape response through untouched, never throwing', () => {
    // No JSON array at all (e.g. the model refused / returned prose).
    const noArray = geminiResponse('Desculpe, não consegui gerar os cards agora.');
    expect(capDeckCardsResponse(noArray, 20)).toBe(noArray);

    // A "[ ... ]" span that is NOT valid JSON.
    const invalid = geminiResponse('[ {"front": "Q", "back":} ]');
    expect(capDeckCardsResponse(invalid, 20)).toBe(invalid);

    // Totally unexpected shapes never throw and come back untouched.
    expect(() => capDeckCardsResponse(null, 20)).not.toThrow();
    expect(capDeckCardsResponse(null, 20)).toBe(null);

    const noCandidates = { candidates: [] };
    expect(capDeckCardsResponse(noCandidates, 20)).toBe(noCandidates);

    const noParts = { candidates: [{ content: {} }] };
    expect(capDeckCardsResponse(noParts, 20)).toBe(noParts);
  });
});
