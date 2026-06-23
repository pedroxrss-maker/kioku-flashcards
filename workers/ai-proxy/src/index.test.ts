import { describe, it, expect } from 'vitest';
import { capDeckCardsResponse, buildModelChain, callGeminiWithFallback } from './index';

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

/* -------------------------------------------------- model fallback chain --- */

/** Pull the model name out of a generateContent endpoint URL. */
function modelOf(url: string): string {
  return /\/models\/([^:]+):/.exec(url)?.[1] ?? '';
}

function makeRes(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** A fake fetch driven by a per-model handler; records the models it was hit for.
 *  A handler may return a Response or reject (to simulate a network failure). */
function mockFetch(byModel: Record<string, () => Promise<Response> | Response>) {
  const calls: string[] = [];
  const fetchImpl = (async (input: unknown) => {
    const url = String(input);
    const model = modelOf(url);
    calls.push(model);
    const handler = byModel[model];
    if (!handler) return makeRes(404, { error: { message: 'unknown model' } });
    return handler();
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

/** Deps that never actually sleep, so the retry/backoff loop runs instantly. */
const fast = (fetchImpl: typeof fetch) => ({ fetchImpl, sleepImpl: () => Promise.resolve() });

const KEY = 'test-key';

describe('buildModelChain', () => {
  it('puts the preferred model first, then the deduped fallback chain', () => {
    expect(buildModelChain('gemini-2.5-flash-lite')).toEqual([
      'gemini-2.5-flash-lite',
      'gemini-2.5-flash',
      'gemini-2.0-flash',
    ]);
  });

  it('promotes a chain model to primary without duplicating it', () => {
    expect(buildModelChain('gemini-2.5-flash')).toEqual([
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      'gemini-2.0-flash',
    ]);
  });

  it('keeps an unknown model as primary and appends the whole chain', () => {
    expect(buildModelChain('gemini-foo')).toEqual([
      'gemini-foo',
      'gemini-2.5-flash-lite',
      'gemini-2.5-flash',
      'gemini-2.0-flash',
    ]);
  });
});

describe('callGeminiWithFallback', () => {
  it('returns ok on the first model that succeeds, trying no others', async () => {
    const { fetchImpl, calls } = mockFetch({
      'gemini-2.5-flash-lite': () => makeRes(200, geminiResponse('[]')),
      'gemini-2.5-flash': () => makeRes(503),
      'gemini-2.0-flash': () => makeRes(503),
    });
    const out = await callGeminiWithFallback(buildModelChain('gemini-2.5-flash-lite'), {}, KEY, fast(fetchImpl));
    expect(out.kind).toBe('ok');
    expect(calls).toEqual(['gemini-2.5-flash-lite']); // one call, no fallthrough
  });

  it('retries 4× per model, then falls through to the next on 503 overload', async () => {
    const { fetchImpl, calls } = mockFetch({
      'gemini-2.5-flash-lite': () => makeRes(503),
      'gemini-2.5-flash': () => makeRes(200, geminiResponse('[]')),
      'gemini-2.0-flash': () => makeRes(503),
    });
    const out = await callGeminiWithFallback(buildModelChain('gemini-2.5-flash-lite'), {}, KEY, fast(fetchImpl));
    expect(out.kind).toBe('ok');
    expect(calls.filter((m) => m === 'gemini-2.5-flash-lite')).toHaveLength(4); // 4 attempts
    expect(calls).toContain('gemini-2.5-flash'); // fell through and won
    expect(calls).not.toContain('gemini-2.0-flash'); // never needed
  });

  it('falls through on a Google 429 (overload) as well', async () => {
    const { fetchImpl } = mockFetch({
      'gemini-2.5-flash-lite': () => makeRes(429, { error: { details: [{ retryDelay: '0s' }] } }),
      'gemini-2.5-flash': () => makeRes(200, geminiResponse('[]')),
      'gemini-2.0-flash': () => makeRes(503),
    });
    const out = await callGeminiWithFallback(buildModelChain('gemini-2.5-flash-lite'), {}, KEY, fast(fetchImpl));
    expect(out.kind).toBe('ok');
  });

  it('only reports overloaded after the WHOLE chain is exhausted (all 503)', async () => {
    const { fetchImpl, calls } = mockFetch({
      'gemini-2.5-flash-lite': () => makeRes(503),
      'gemini-2.5-flash': () => makeRes(503),
      'gemini-2.0-flash': () => makeRes(503),
    });
    const out = await callGeminiWithFallback(buildModelChain('gemini-2.5-flash-lite'), {}, KEY, fast(fetchImpl));
    expect(out.kind).toBe('overloaded');
    expect(calls).toHaveLength(12); // 3 models × 4 attempts
  });

  it('fails fast on a real Google error (400) without retrying or falling through', async () => {
    const { fetchImpl, calls } = mockFetch({
      'gemini-2.5-flash-lite': () => makeRes(400, { error: { message: 'bad request' } }),
      'gemini-2.5-flash': () => makeRes(200, geminiResponse('[]')),
    });
    const out = await callGeminiWithFallback(buildModelChain('gemini-2.5-flash-lite'), {}, KEY, fast(fetchImpl));
    expect(out.kind).toBe('error');
    expect(calls).toEqual(['gemini-2.5-flash-lite']); // no retry, no fallthrough
  });

  it('falls through on a network failure and can still win on a later model', async () => {
    const { fetchImpl, calls } = mockFetch({
      'gemini-2.5-flash-lite': () => Promise.reject(new Error('network down')),
      'gemini-2.5-flash': () => makeRes(200, geminiResponse('[]')),
      'gemini-2.0-flash': () => makeRes(503),
    });
    const out = await callGeminiWithFallback(buildModelChain('gemini-2.5-flash-lite'), {}, KEY, fast(fetchImpl));
    expect(out.kind).toBe('ok');
    expect(calls.filter((m) => m === 'gemini-2.5-flash-lite')).toHaveLength(4); // retried, then fell through
  });
});
