/** Brand marks reused across the landing nav, band and footer. */
import brainIcon from '../../../neurofluency-favicon.png';

/** Kioku wordmark with the rounded brain icon. */
export function KiokuMark({ size = 26 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <img
        src={brainIcon}
        alt=""
        draggable={false}
        style={{ height: size, width: size, borderRadius: size * 0.28 }}
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
