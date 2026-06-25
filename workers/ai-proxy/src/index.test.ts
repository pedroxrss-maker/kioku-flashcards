import { describe, it, expect } from 'vitest';
import {
  capDeckCardsResponse,
  buildModelChain,
  callGeminiWithFallback,
  streamGeminiWithFallback,
} from './index';

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

/* ------------------------------------------- streaming (SSE) fallback ------- */
// Streaming must use the SAME 3-model fallback: fall through only while a model
// can't START the stream (503/429), return on the first 200 (relay), fail fast on
// a real error. It hits :streamGenerateContent (vs :generateContent).

/** Pull the model name out of a streamGenerateContent endpoint URL. */
function streamCalls(byModel: Record<string, () => Promise<Response> | Response>) {
  const calls: string[] = [];
  const fetchImpl = (async (input: unknown) => {
    const url = String(input);
    expect(url).toContain(':streamGenerateContent'); // uses the SSE endpoint
    const model = /\/models\/([^:]+):/.exec(url)?.[1] ?? '';
    calls.push(model);
    const handler = byModel[model];
    if (!handler) return makeRes(404, { error: { message: 'unknown model' } });
    return handler();
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

/** A streaming 200 whose SSE body carries one text delta (so the peek finds "text"). */
function sseRes(text = 'hi'): Response {
  const payload = JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] });
  return new Response(`data: ${payload}\n\n`, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

/** A streaming 200 whose body NEVER emits (flash-lite accepts then stalls forever). */
function hangRes(): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start() {
        /* never enqueue, never close: the first token never arrives */
      },
    }),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  );
}

/** Drain a relay stream to a string. */
async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let out = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += dec.decode(value, { stream: true });
  }
  return out;
}

/** Budget timer that NEVER fires — the first model gets unlimited time (healthy case). */
const neverBudget = () => ({ signal: new Promise<void>(() => {}), cancel: () => {} });
/** Budget timer that fires IMMEDIATELY — the first model's window is already blown. */
const instantBudget = () => ({ signal: Promise.resolve(), cancel: () => {} });

/** Streaming deps: instant backoff + an injectable budget timer (defaults to never). */
const streamDeps = (fetchImpl: typeof fetch, budgetTimer = neverBudget) => ({
  fetchImpl,
  sleepImpl: () => Promise.resolve(),
  budgetTimer,
});

describe('streamGeminiWithFallback', () => {
  it('uses flash-lite when it STARTS streaming text within the budget (cheap, healthy)', async () => {
    const { fetchImpl, calls } = streamCalls({
      'gemini-2.5-flash-lite': () => sseRes('oi'),
      'gemini-2.5-flash': () => makeRes(503),
    });
    const out = await streamGeminiWithFallback(buildModelChain('gemini-2.5-flash-lite'), {}, KEY, streamDeps(fetchImpl));
    expect(out.kind).toBe('ok');
    if (out.kind === 'ok') expect(await readAll(out.stream)).toContain('oi'); // the relayed text
    expect(calls).toEqual(['gemini-2.5-flash-lite']); // never touched flash
  });

  it('abandons flash-lite for flash when it STALLS past the budget (200 but no first token)', async () => {
    const { fetchImpl, calls } = streamCalls({
      'gemini-2.5-flash-lite': () => hangRes(), // accepts, then never emits
      'gemini-2.5-flash': () => sseRes('hi'),
    });
    // instantBudget = the 800ms window is already blown -> bail to flash immediately.
    const out = await streamGeminiWithFallback(
      buildModelChain('gemini-2.5-flash-lite'),
      {},
      KEY,
      streamDeps(fetchImpl, instantBudget),
    );
    expect(out.kind).toBe('ok');
    if (out.kind === 'ok') expect(await readAll(out.stream)).toContain('hi'); // flash served it
    expect(calls).toContain('gemini-2.5-flash');
  });

  it('falls through when flash-lite returns 200 but ENDS without ever emitting text', async () => {
    const { fetchImpl, calls } = streamCalls({
      'gemini-2.5-flash-lite': () => makeRes(200, { ok: true }), // 200, body has no "text", then ends
      'gemini-2.5-flash': () => sseRes('hi'),
    });
    const out = await streamGeminiWithFallback(buildModelChain('gemini-2.5-flash-lite'), {}, KEY, streamDeps(fetchImpl));
    expect(out.kind).toBe('ok');
    if (out.kind === 'ok') expect(await readAll(out.stream)).toContain('hi');
    expect(calls.filter((m) => m === 'gemini-2.5-flash-lite')).toHaveLength(1); // single budgeted attempt
    expect(calls).toContain('gemini-2.5-flash');
  });

  it('abandons flash-lite on a 503 in a SINGLE budgeted attempt (no retry), goes to flash', async () => {
    const { fetchImpl, calls } = streamCalls({
      'gemini-2.5-flash-lite': () => makeRes(503),
      'gemini-2.5-flash': () => sseRes('hi'),
      'gemini-2.0-flash': () => makeRes(503),
    });
    const out = await streamGeminiWithFallback(buildModelChain('gemini-2.5-flash-lite'), {}, KEY, streamDeps(fetchImpl));
    expect(out.kind).toBe('ok');
    // The budgeted FIRST model does NOT retry — one shot, then straight to flash (faster
    // than the old 1+1 retry). The later models keep the 2-attempt fast-fallthrough.
    expect(calls.filter((m) => m === 'gemini-2.5-flash-lite')).toHaveLength(1);
    expect(calls).toContain('gemini-2.5-flash');
    expect(calls).not.toContain('gemini-2.0-flash');
  });

  it('reports overloaded after the WHOLE chain fails (flash-lite 1 + flash 2 + 2.0 2 = 5 calls)', async () => {
    const { fetchImpl, calls } = streamCalls({
      'gemini-2.5-flash-lite': () => makeRes(503),
      'gemini-2.5-flash': () => makeRes(503),
      'gemini-2.0-flash': () => makeRes(503),
    });
    const out = await streamGeminiWithFallback(buildModelChain('gemini-2.5-flash-lite'), {}, KEY, streamDeps(fetchImpl));
    expect(out.kind).toBe('overloaded');
    expect(calls).toHaveLength(5); // flash-lite 1 (budgeted) + flash 2 + 2.0-flash 2
  });

  it('a LATER model (flash) ignores a long retryDelay and does its quick 2-attempt fallthrough', async () => {
    const { fetchImpl, calls } = streamCalls({
      'gemini-2.5-flash-lite': () => makeRes(503), // bail to flash
      // flash gets a 429 with a 30s hint that MUST be ignored: 2 quick attempts, then 2.0.
      'gemini-2.5-flash': () => makeRes(429, { error: { details: [{ retryDelay: '30s' }] } }),
      'gemini-2.0-flash': () => sseRes('hi'),
    });
    const out = await streamGeminiWithFallback(buildModelChain('gemini-2.5-flash-lite'), {}, KEY, streamDeps(fetchImpl));
    expect(out.kind).toBe('ok');
    expect(calls.filter((m) => m === 'gemini-2.5-flash')).toHaveLength(2); // quick retry, not a 30s wait
    expect(calls).toContain('gemini-2.0-flash');
  });

  it('fails fast on a real error (400) from flash-lite without fallthrough', async () => {
    const { fetchImpl, calls } = streamCalls({
      'gemini-2.5-flash-lite': () => makeRes(400, { error: { message: 'bad request' } }),
      'gemini-2.5-flash': () => sseRes('hi'),
    });
    const out = await streamGeminiWithFallback(buildModelChain('gemini-2.5-flash-lite'), {}, KEY, streamDeps(fetchImpl));
    expect(out.kind).toBe('error');
    expect(calls).toEqual(['gemini-2.5-flash-lite']);
  });

  // Tutor TTFT fix: the streaming path disables Gemini "thinking" (thinkingBudget:0)
  // to skip the multi-second internal reasoning phase — but ONLY on the 2.5-flash
  // family. The 2.0-flash isn't a thinking model, so the field must NOT be sent to it
  // (an unsupported field could 400). This pins the per-model guard.
  it('sends thinkingBudget:0 to the 2.5-flash family but NOT to 2.0-flash', async () => {
    const bodies: Record<string, Record<string, unknown>> = {};
    const fetchImpl = (async (input: unknown, init: RequestInit) => {
      const url = String(input);
      const model = /\/models\/([^:]+):/.exec(url)?.[1] ?? '';
      bodies[model] = JSON.parse(String(init.body)) as Record<string, unknown>;
      // 2.5 models 503 so the chain falls all the way through and we capture every body.
      return model === 'gemini-2.0-flash' ? makeRes(200, { ok: true }) : makeRes(503);
    }) as unknown as typeof fetch;

    const reqBody = { contents: [], generationConfig: { maxOutputTokens: 700 } };
    await streamGeminiWithFallback(buildModelChain('gemini-2.5-flash-lite'), reqBody, KEY, streamDeps(fetchImpl));

    const gen = (m: string) => bodies[m]?.generationConfig as Record<string, unknown> | undefined;
    // 2.5 family: thinking disabled, and the original generationConfig is preserved.
    expect(gen('gemini-2.5-flash-lite')?.thinkingConfig).toEqual({ thinkingBudget: 0 });
    expect(gen('gemini-2.5-flash-lite')?.maxOutputTokens).toBe(700);
    expect(gen('gemini-2.5-flash')?.thinkingConfig).toEqual({ thinkingBudget: 0 });
    // 2.0-flash: the field is omitted (unsupported), body passes through untouched.
    expect(gen('gemini-2.0-flash')).not.toHaveProperty('thinkingConfig');
    expect(gen('gemini-2.0-flash')?.maxOutputTokens).toBe(700);
  });
});
