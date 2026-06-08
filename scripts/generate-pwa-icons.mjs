// Generates the PWA / favicon icon set from the NeuroFluency brain mark.
//
// Source: ../neurofluency-favicon.png — black brain line-art on a white
// background (no transparency). We extract the strokes as an alpha mask
// (dark ink => opaque) and recolor them WHITE on the brand background
// (#0e0e11), so the icon reads on the dark app theme and matches the white
// NeuroFluency wordmark. Re-run with: node scripts/generate-pwa-icons.mjs
//
// Self-contained: decodes/encodes PNG with Node's built-in zlib, no deps.
import { inflateSync, deflateSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const SRC = join(ROOT, 'neurofluency-favicon.png');

// ---- brand colors ----------------------------------------------------------
const BG = [0x0e, 0x0e, 0x11]; // background_color / theme_color
const LOGO = [0xf5, 0xf5, 0xf4]; // white brain strokes (app fg)
const INK_CUTOFF = 250; // luminance below this counts as ink (anti-aliased)

// ---- PNG decode -------------------------------------------------------------
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let pos = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + len;
  }
  if (bitDepth !== 8) throw new Error(`unsupported bit depth ${bitDepth}`);
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`unsupported color type ${colorType}`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = new Uint8Array(height * stride);
  let prev = new Uint8Array(stride);
  let rp = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[rp++];
    const cur = out.subarray(y * stride, y * stride + stride);
    for (let i = 0; i < stride; i++) {
      const x = raw[rp++];
      const a = i >= channels ? cur[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let val;
      switch (filter) {
        case 0: val = x; break;
        case 1: val = x + a; break;
        case 2: val = x + b; break;
        case 3: val = x + ((a + b) >> 1); break;
        case 4: val = x + paeth(a, b, c); break;
        default: throw new Error(`bad filter ${filter}`);
      }
      cur[i] = val & 0xff;
    }
    prev = cur;
  }
  // -> luminance over white (handles RGB/gray/alpha sources)
  const lum = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    let r;
    let g;
    let b;
    let alpha = 255;
    if (channels === 1) {
      r = g = b = out[i];
    } else if (channels === 2) {
      r = g = b = out[i * 2];
      alpha = out[i * 2 + 1];
    } else {
      r = out[i * channels];
      g = out[i * channels + 1];
      b = out[i * channels + 2];
      if (channels === 4) alpha = out[i * channels + 3];
    }
    let l = 0.299 * r + 0.587 * g + 0.114 * b;
    l = l * (alpha / 255) + 255 * (1 - alpha / 255); // composite over white
    lum[i] = l;
  }
  return { width, height, lum };
}

// ---- PNG encode (opaque RGBA) ----------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function encodePng(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 4)] = 0;
    Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(raw, y * (1 + size * 4) + 1);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- compose an icon --------------------------------------------------------
const src = decodePng(readFileSync(SRC));

// Tight bounding box of the ink, so we control padding precisely.
let x0 = src.width;
let y0 = src.height;
let x1 = 0;
let y1 = 0;
for (let y = 0; y < src.height; y++) {
  for (let x = 0; x < src.width; x++) {
    if (src.lum[y * src.width + x] < INK_CUTOFF) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
}
const bw = x1 - x0 + 1;
const bh = y1 - y0 + 1;

/** Render `size`px icon. `coverage` = the logo's longer side as a fraction of
 *  the canvas (smaller for maskable, to clear the circular safe zone). */
function renderIcon(size, coverage) {
  const out = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    out[i * 4] = BG[0];
    out[i * 4 + 1] = BG[1];
    out[i * 4 + 2] = BG[2];
    out[i * 4 + 3] = 255;
  }
  const scale = (size * coverage) / Math.max(bw, bh);
  const logoW = bw * scale;
  const logoH = bh * scale;
  const offX = (size - logoW) / 2;
  const offY = (size - logoH) / 2;
  const ratio = bw / logoW; // src px per dest px (>= 1, downscaling)
  for (let dy = 0; dy < size; dy++) {
    const sy = y0 + (dy + 0.5 - offY) * ratio;
    if (sy < y0 || sy > y1 + 1) continue;
    for (let dx = 0; dx < size; dx++) {
      const sx = x0 + (dx + 0.5 - offX) * ratio;
      if (sx < x0 || sx > x1 + 1) continue;
      // area-average the source luminance covered by this dest pixel
      const ax0 = Math.max(x0, Math.floor(sx - ratio / 2));
      const ax1 = Math.min(x1, Math.ceil(sx + ratio / 2));
      const ay0 = Math.max(y0, Math.floor(sy - ratio / 2));
      const ay1 = Math.min(y1, Math.ceil(sy + ratio / 2));
      let sum = 0;
      let n = 0;
      for (let yy = ay0; yy <= ay1; yy++) {
        for (let xx = ax0; xx <= ax1; xx++) {
          sum += src.lum[yy * src.width + xx];
          n++;
        }
      }
      if (n === 0) continue;
      const alpha = 1 - sum / n / 255; // dark ink => opaque
      if (alpha <= 0.003) continue;
      const o = (dy * size + dx) * 4;
      out[o] = Math.round(BG[0] * (1 - alpha) + LOGO[0] * alpha);
      out[o + 1] = Math.round(BG[1] * (1 - alpha) + LOGO[1] * alpha);
      out[o + 2] = Math.round(BG[2] * (1 - alpha) + LOGO[2] * alpha);
    }
  }
  return out;
}

mkdirSync(PUBLIC, { recursive: true });
const targets = [
  ['pwa-192.png', 192, 0.8], // any
  ['pwa-512.png', 512, 0.8], // any
  ['pwa-maskable-512.png', 512, 0.66], // maskable: padded for the safe zone
  ['apple-touch-icon.png', 180, 0.78], // iOS home screen (opaque)
  ['favicon-32.png', 32, 0.86], // browser tab
];
for (const [name, size, coverage] of targets) {
  writeFileSync(join(PUBLIC, name), encodePng(size, renderIcon(size, coverage)));
  console.log(`wrote public/${name} (${size}x${size})`);
}
