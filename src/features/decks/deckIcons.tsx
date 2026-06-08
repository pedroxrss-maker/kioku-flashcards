import { useRef } from 'react';
import type { ChangeEvent, CSSProperties } from 'react';
import {
  Atom,
  BookOpen,
  Brain,
  Calculator,
  Code2,
  Dumbbell,
  FlaskConical,
  Globe,
  GraduationCap,
  Heart,
  ImagePlus,
  Languages,
  Leaf,
  Map,
  Music,
  Palette,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useSettings } from '../../db/hooks';
import type { Deck } from '../../db/types';

/** Preset logos a deck can use (id -> lucide icon). */
export const DECK_ICONS: Record<string, LucideIcon> = {
  book: BookOpen,
  brain: Brain,
  languages: Languages,
  globe: Globe,
  flask: FlaskConical,
  atom: Atom,
  calc: Calculator,
  code: Code2,
  music: Music,
  palette: Palette,
  dumbbell: Dumbbell,
  heart: Heart,
  leaf: Leaf,
  map: Map,
  grad: GraduationCap,
};
const ICON_IDS = Object.keys(DECK_ICONS);

/** A distinct, clean color per preset icon (used to tint the picker). */
export const DECK_ICON_COLORS: Record<string, string> = {
  book: '#ff3b1f', // red
  brain: '#b14cff', // violet
  languages: '#1f6dff', // blue
  globe: '#00c2c7', // teal
  flask: '#00b569', // green
  atom: '#ff9d00', // amber
  calc: '#ffd000', // yellow
  code: '#00b569', // green
  music: '#ff4d9d', // pink
  palette: '#b14cff', // violet
  dumbbell: '#ff3b1f', // red
  heart: '#ff4d9d', // pink
  leaf: '#00b569', // green
  map: '#00c2c7', // teal
  grad: '#1f6dff', // blue
};

/** Deterministic default so each deck gets a distinct logo even before a choice. */
export function defaultIconFor(deckId: string): string {
  let h = 0;
  for (let i = 0; i < deckId.length; i += 1) h = (h * 31 + deckId.charCodeAt(i)) >>> 0;
  return ICON_IDS[h % ICON_IDS.length];
}

/**
 * The deck's logo, shown everywhere a deck appears: a custom uploaded image
 * (always rounded), a chosen preset icon, or a distinct per-deck default.
 */
export function DeckAvatar({ deck, size = 44, icon }: { deck: Deck; size?: number; icon?: string }) {
  const settings = useSettings();
  const value = icon ?? settings?.deckIcons?.[deck.id];

  if (value && value.startsWith('data:')) {
    return (
      <img
        src={value}
        alt=""
        draggable={false}
        style={{
          width: size,
          height: size,
          borderRadius: 'var(--r-sm)',
          objectFit: 'cover',
          flexShrink: 0,
          display: 'block',
        }}
      />
    );
  }

  const id = value && DECK_ICONS[value] ? value : defaultIconFor(deck.id);
  const Icon = DECK_ICONS[id];
  return (
    <span
      className="icon-tile"
      style={{ '--tile': deck.color, width: size, height: size } as CSSProperties}
    >
      <Icon size={Math.round(size * 0.48)} />
    </span>
  );
}

/** Resize an uploaded image to a small square thumbnail data URL (cover-cropped). */
export function fileToThumbDataUrl(file: File, size = 96): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('no 2d context'));
        return;
      }
      const scale = Math.max(size / img.width, size / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image load failed'));
    };
    img.src = url;
  });
}

/** Logo picker: preset icons (in the deck color) + a custom-image upload tile. */
export function DeckIconPicker({
  color,
  value,
  onChange,
}: {
  color: string;
  value: string | undefined;
  onChange: (v: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const isCustom = !!value && value.startsWith('data:');

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      onChange(await fileToThumbDataUrl(file));
    } catch {
      /* ignore unreadable images */
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {ICON_IDS.map((id) => {
        const Icon = DECK_ICONS[id];
        const selected = value === id;
        const iconColor = DECK_ICON_COLORS[id] ?? color;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={selected}
            aria-label={id}
            onClick={() => onChange(id)}
            className="icon-tile"
            style={{
              '--tile': selected ? `color-mix(in srgb, ${iconColor} 26%, transparent)` : 'var(--surface-2)',
              color: iconColor,
              width: 38,
              height: 38,
              outline: `2px solid ${selected ? iconColor : 'transparent'}`,
              outlineOffset: 2,
              transform: selected ? 'scale(1.1)' : 'none',
              transition: 'transform 0.18s ease, background-color 0.2s ease, outline-color 0.2s ease',
            } as CSSProperties}
          >
            <Icon size={18} />
          </button>
        );
      })}

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="icon-tile"
        title="Anexar imagem do computador"
        aria-label="Anexar imagem do computador"
        style={{
          '--tile': 'var(--surface-2)',
          color: 'var(--muted)',
          width: 38,
          height: 38,
          padding: 0,
          overflow: 'hidden',
          outline: isCustom ? `2px solid ${color}` : '1px dashed var(--line-strong)',
          outlineOffset: 2,
          transform: isCustom ? 'scale(1.1)' : 'none',
          transition: 'transform 0.18s ease, outline-color 0.2s ease',
        } as CSSProperties}
      >
        {isCustom ? (
          <img
            src={value}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--r-sm)' }}
          />
        ) : (
          <ImagePlus size={18} />
        )}
      </button>

      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
    </div>
  );
}
