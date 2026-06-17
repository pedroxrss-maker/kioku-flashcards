import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/Button';

const VIEWPORT = 280; // circular preview diameter (px)
const OUTPUT = 320; // exported circular PNG size (px)

/**
 * Circular profile-photo editor: load an image, pan (drag) and zoom (slider) to
 * frame it inside a circle, then export a centered, circular PNG data URL. The
 * preview circle IS the crop, so what you see is exactly what gets saved.
 */
export function ProfilePhotoEditor({
  open,
  src,
  onCancel,
  onSave,
}: {
  open: boolean;
  /** Data URL of the chosen image (null while closed). */
  src: string | null;
  onCancel: () => void;
  onSave: (dataUrl: string) => void;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  // Load the image to read its natural size; reset framing for each new src.
  useEffect(() => {
    if (!src) {
      setImg(null);
      return;
    }
    const im = new Image();
    im.onload = () => {
      setImg(im);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    };
    im.src = src;
  }, [src]);

  const natW = img?.naturalWidth ?? 1;
  const natH = img?.naturalHeight ?? 1;
  // Cover the viewport at zoom 1, then multiply by the user's zoom.
  const baseScale = Math.max(VIEWPORT / natW, VIEWPORT / natH);
  const dispW = natW * baseScale * zoom;
  const dispH = natH * baseScale * zoom;

  /** Keep the offset within bounds so the image always fills the circle. */
  function clampFor(z: number, x: number, y: number) {
    const dW = natW * baseScale * z;
    const dH = natH * baseScale * z;
    const mX = Math.max(0, (dW - VIEWPORT) / 2);
    const mY = Math.max(0, (dH - VIEWPORT) / 2);
    return { x: Math.min(mX, Math.max(-mX, x)), y: Math.min(mY, Math.max(-mY, y)) };
  }

  function onPointerDown(e: ReactPointerEvent) {
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: ReactPointerEvent) {
    const d = drag.current;
    if (!d) return;
    setOffset(clampFor(zoom, d.ox + (e.clientX - d.x), d.oy + (e.clientY - d.y)));
  }
  function endDrag() {
    drag.current = null;
  }

  function changeZoom(z: number) {
    setZoom(z);
    setOffset((o) => clampFor(z, o.x, o.y));
  }

  function save() {
    if (!img) return;
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const k = OUTPUT / VIEWPORT;
    ctx.save();
    ctx.beginPath();
    ctx.arc(OUTPUT / 2, OUTPUT / 2, OUTPUT / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    const dW = dispW * k;
    const dH = dispH * k;
    const cx = OUTPUT / 2 + offset.x * k;
    const cy = OUTPUT / 2 + offset.y * k;
    ctx.drawImage(img, cx - dW / 2, cy - dH / 2, dW, dH);
    ctx.restore();
    onSave(canvas.toDataURL('image/png'));
  }

  return (
    <Modal
      open={open}
      onClose={onCancel}
      persistent
      title="Ajustar foto de perfil"
      width={400}
      onSubmit={() => {
        if (img) save();
      }}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="accent" size="sm" onClick={save} disabled={!img}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-4">
        <p className="text-xs text-muted text-center" style={{ maxWidth: VIEWPORT }}>
          Arraste para posicionar e use o controle para aproximar. A foto será circular.
        </p>
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="relative overflow-hidden select-none cursor-grab active:cursor-grabbing"
          style={{
            width: VIEWPORT,
            height: VIEWPORT,
            borderRadius: '50%',
            background: 'var(--surface-2)',
            boxShadow: '0 0 0 2px var(--line-strong)',
            touchAction: 'none',
          }}
        >
          {img && (
            <img
              src={src ?? undefined}
              alt=""
              draggable={false}
              style={{
                position: 'absolute',
                width: dispW,
                height: dispH,
                left: VIEWPORT / 2 + offset.x - dispW / 2,
                top: VIEWPORT / 2 + offset.y - dispH / 2,
                maxWidth: 'none',
                pointerEvents: 'none',
              }}
            />
          )}
        </div>
        <div className="flex items-center gap-3 w-full" style={{ maxWidth: VIEWPORT }}>
          <ZoomOut size={16} className="text-muted shrink-0" />
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => changeZoom(Number(e.target.value))}
            className="flex-1"
            style={{ accentColor: 'var(--accent)' }}
            aria-label="Aproximar"
          />
          <ZoomIn size={16} className="text-muted shrink-0" />
        </div>
      </div>
    </Modal>
  );
}
