import faviconSrc from '../../kioku-favicon.png';

/**
 * Build a rounded-corner favicon at runtime: the source image fills a rounded-rect
 * tile (transparent corners) and is set as the page icon. No white background —
 * the image's own colors show edge to edge, only the corners are curved.
 */
export function applyRoundedFavicon(): void {
  if (typeof document === 'undefined') return;

  const size = 128;
  const radius = 28; // ~22% — curved corners

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  };

  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0, 0, size, size);
    roundRect(0, 0, size, size, radius);
    ctx.save();
    ctx.clip();
    // Cover the whole rounded tile with the image — no white background, no padding.
    const scale = Math.max(size / img.width, size / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    ctx.restore();

    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.type = 'image/png';
    link.href = canvas.toDataURL('image/png');
  };
  img.src = faviconSrc;
}
