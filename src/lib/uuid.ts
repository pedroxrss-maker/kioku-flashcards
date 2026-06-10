// Precomputed byte->hex pairs ("00".."ff").
const HEX: string[] = [];
for (let i = 0; i < 256; i += 1) HEX.push((i + 0x100).toString(16).slice(1));

/**
 * RFC4122 v4 UUID. Prefers `crypto.randomUUID()` but falls back to
 * `crypto.getRandomValues` (and finally `Math.random`) when it is unavailable.
 *
 * Why this exists: `crypto.randomUUID` only exists in Safari 15.4+ AND only in
 * a secure context (HTTPS). On an older iPad — or over plain HTTP — it is
 * `undefined`, so calling it threw and silently broke deck/card/review creation
 * ("Criar deck" did nothing). Route every id through here instead.
 */
export function uuid(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();

  const b = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(b);
  else for (let i = 0; i < 16; i += 1) b[i] = (Math.random() * 256) | 0;

  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant 10xx

  return (
    HEX[b[0]] + HEX[b[1]] + HEX[b[2]] + HEX[b[3]] + '-' +
    HEX[b[4]] + HEX[b[5]] + '-' +
    HEX[b[6]] + HEX[b[7]] + '-' +
    HEX[b[8]] + HEX[b[9]] + '-' +
    HEX[b[10]] + HEX[b[11]] + HEX[b[12]] + HEX[b[13]] + HEX[b[14]] + HEX[b[15]]
  );
}
