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
    // Sample the image's own background (a corner pixel) so the inset around the
    // smaller brain is filled seamlessly — no transparent gap, no visible seam.
    let bg = '#0e0e11';
    const probe = document.createElement('canvas');
    probe.width = img.width;
    probe.height = img.height;
    const pctx = probe.getContext('2d');
    if (pctx) {
      pctx.drawImage(img, 0, 0);
      try {
        const [r, g, b] = pctx.getImageData(0, 0, 1, 1).data;
        bg = `rgb(${r}, ${g}, ${b})`;
      } catch {
        /* tainted canvas (não ocorre com asset local): mantém o fallback */
      }
    }

    ctx.clearRect(0, 0, size, size);
    roundRect(0, 0, size, size, radius);
    ctx.save();
    ctx.clip();
    // Fill the rounded tile with the image's own background, then draw the brain
    // 15% smaller than "cover" (× 0.85), centered — leaving an even inset around it.
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);
    const scale = Math.max(size / img.width, size / img.height) * 0.85;
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
