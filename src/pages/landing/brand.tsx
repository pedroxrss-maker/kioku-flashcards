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
        style={{ height: size, width: size }}
      />
      <span className="display" style={{ fontSize: size * 0.85, fontWeight: 600, lineHeight: 1 }}>
        Kioku
      </span>
    </span>
  );
}

/** The neurofluency wordmark (neuro = fg, fluency = accent), Manrope. */
export function NeuroWordmark({ size = 14 }: { size?: number }) {
  return (
    <span
      style={{ fontFamily: 'var(--body)', fontWeight: 800, fontSize: size, letterSpacing: 0 }}
    >
      <span style={{ color: 'var(--fg)' }}>neuro</span>
      <span style={{ color: 'var(--accent)' }}>fluency</span>
    </span>
  );
}

/** neurofluency wordmark with the brain logo to its left, as shown in the app. */
export function NeuroLockup({ size = 18 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <img
        src={brandLogo}
        alt=""
        draggable={false}
        style={{ height: size * 1.45, width: size * 1.45 }}
      />
      <NeuroWordmark size={size} />
    </span>
  );
}
