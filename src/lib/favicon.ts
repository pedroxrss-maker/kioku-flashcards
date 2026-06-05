import faviconSrc from '../../neurofluency-favicon.png';

/**
 * Build a rounded-corner favicon at runtime: the brain image is drawn centered
 * on a white rounded-rect tile (transparent corners) and set as the page icon.
 * Done in-canvas so the non-square source picks up curved borders without any
 * image pre-processing.
 */
export function applyRoundedFavicon(): void {
  if (typeof document === 'undefined') return;

  const size = 128;
  const radius = 28; // ~22% — curved corners
  const pad = 16;

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
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.clip();
    // Contain the image inside the padded tile, centered.
    const maxW = size - pad * 2;
    const maxH = size - pad * 2;
    const scale = Math.min(maxW / img.width, maxH / img.height);
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
