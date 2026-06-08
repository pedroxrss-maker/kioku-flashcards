// Generates the PWA icons (192, 512, maskable 512) into ./public.
//
// ⚠️ PLACEHOLDER ICONS — these are a simple geometric mark derived from
// public/favicon.svg (a white flashcard with the accent underline) on the
// brand background. Replace public/pwa-*.png with the final Kioku logo when
// it's ready; re-run `node scripts/generate-pwa-icons.mjs` to regenerate.
//
// Self-contained: encodes PNGs with Node's built-in zlib, no image deps.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

// ---- brand colors ----------------------------------------------------------
const BG = [0x0e, 0x0e, 0x11]; // background_color / theme_color
const CARD = [0xf5, 0xf5, 0xf4]; // app fg (white card)
const ACCENT = [0xff, 0x3b, 0x1f]; // accent

// ---- PNG encoding (RGBA, 8-bit) --------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function encodePng(size, rgb) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 4)] = 0; // no filter
    rgb.copy(raw, y * (1 + size * 4) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- drawing ----------------------------------------------------------------
function inRoundRect(px, py, cx, cy, w, h, r) {
  const dx = Math.abs(px - cx);
  const dy = Math.abs(py - cy);
  const hw = w / 2;
  const hh = h / 2;
  if (dx > hw || dy > hh) return false;
  if (dx <= hw - r || dy <= hh - r) return true;
  const ex = dx - (hw - r);
  const ey = dy - (hh - r);
  return ex * ex + ey * ey <= r * r;
}

/** Renders the placeholder mark at `size`px. `contentScale` is the card width
 *  as a fraction of the canvas (smaller for maskable, to clear the safe zone). */
function renderIcon(size, contentScale) {
  const SS = 4; // 4x supersample for smooth corners
  const W = size * SS;
  const buf = Buffer.alloc(W * W * 4);
  for (let i = 0; i < W * W; i++) {
    buf[i * 4] = BG[0];
    buf[i * 4 + 1] = BG[1];
    buf[i * 4 + 2] = BG[2];
    buf[i * 4 + 3] = 255;
  }
  const cw = W * contentScale;
  const ch = cw * 0.86;
  const cx = W / 2;
  const cy = W / 2;
  const cardR = ch * 0.16;
  const aw = cw * 0.5;
  const ah = ch * 0.16;
  const ar = ah / 2;
  const acy = cy + ch * 0.2;
  const set = (x, y, c) => {
    const i = (y * W + x) * 4;
    buf[i] = c[0];
    buf[i + 1] = c[1];
    buf[i + 2] = c[2];
  };
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      if (inRoundRect(x, y, cx, cy, cw, ch, cardR)) set(x, y, CARD);
      if (inRoundRect(x, y, cx, acy, aw, ah, ar)) set(x, y, ACCENT);
    }
  }
  // box-downsample to target size
  const out = Buffer.alloc(size * size * 4);
  const n = SS * SS;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * W + (x * SS + sx)) * 4;
          r += buf[i];
          g += buf[i + 1];
          b += buf[i + 2];
        }
      }
      const o = (y * size + x) * 4;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
      out[o + 3] = 255;
    }
  }
  return out;
}

mkdirSync(PUBLIC, { recursive: true });
const targets = [
  ['pwa-192.png', 192, 0.62],
  ['pwa-512.png', 512, 0.62],
  ['pwa-maskable-512.png', 512, 0.5], // extra padding for the maskable safe zone
];
for (const [name, size, scale] of targets) {
  writeFileSync(join(PUBLIC, name), encodePng(size, renderIcon(size, scale)));
  console.log(`wrote public/${name} (${size}x${size})`);
}
