/**
 * Downscale an image Blob to <= max px on its longest side and re-encode it to a
 * compact Blob (PNG for transparency-capable sources, JPEG otherwise). Used when
 * uploading card/import images to Storage so synced media stays small.
 */
export interface ResizedImage {
  blob: Blob;
  ext: 'png' | 'jpg';
  contentType: string;
}

export async function resizeImageBlob(file: Blob, max = 1280): Promise<ResizedImage> {
  const mime = file.type || 'image/png';
  const objUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('image decode failed'));
      i.src = objUrl;
    });
    const longest = Math.max(img.width, img.height) || 1;
    const scale = Math.min(1, max / longest);
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.drawImage(img, 0, 0, w, h);
    // Keep PNG for sources that may carry transparency; compress the rest as JPEG.
    const keepPng = mime === 'image/png' || mime === 'image/webp' || mime === 'image/gif';
    const type = keepPng ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.82));
    if (!blob) throw new Error('image encode failed');
    return { blob, ext: keepPng ? 'png' : 'jpg', contentType: type };
  } finally {
    URL.revokeObjectURL(objUrl);
  }
}
