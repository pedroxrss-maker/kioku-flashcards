/** Brand marks reused across the landing nav, band and footer. */
import brandLogo from '../../../neurofluency-logo-branca.png';

/** Kioku wordmark with the neurofluency brain logo. */
export function KiokuMark({ size = 26 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <img
        src={brandLogo}
        alt=""
        draggable={false}
        className="brand-logo-mark"
        style={{ height: size, width: size }}
      />
      {/* Explicit color: this wordmark lives inside a <button> in the landing nav,
          and iOS Safari paints unstyled button text in the system blue tint.
          Pinning it to var(--fg) keeps it on-theme (and flips with dark/light). */}
      <span
        className="display"
        style={{ fontSize: size * 0.85, fontWeight: 600, lineHeight: 1, color: 'var(--fg)' }}
      >
        Kioku
      </span>
    </span>
  );
}

/** The neurofluency wordmark (neuro = fg, fluency = accent), Manrope.
 *  `onLight` switches "neuro" to a dark tone for light backgrounds. */
export function NeuroWordmark({ size = 14, onLight = false }: { size?: number; onLight?: boolean }) {
  return (
    <span
      style={{ fontFamily: 'var(--body)', fontWeight: 800, fontSize: size, letterSpacing: 0 }}
    >
      <span style={{ color: onLight ? '#17171b' : 'var(--fg)' }}>neuro</span>
      <span style={{ color: 'var(--accent)' }}>fluency</span>
    </span>
  );
}

/** neurofluency wordmark with the brain logo to its left. `onLight` darkens the
 *  (white) logo + text so it reads on a light background. */
export function NeuroLockup({ size = 18, onLight = false }: { size?: number; onLight?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <img
        src={brandLogo}
        alt=""
        draggable={false}
        style={{ height: size * 1.45, width: size * 1.45, filter: onLight ? 'invert(1)' : undefined }}
      />
      <NeuroWordmark size={size} onLight={onLight} />
    </span>
  );
}
