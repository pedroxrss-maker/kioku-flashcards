/**
 * Synthesized celebration sounds — no audio assets, just the Web Audio API.
 *
 *  - playCelebration(): an ascending C-major arpeggio (C5-E5-G5-C6), the
 *    "level up / achievement" chime.
 *  - playConfetti(): a short, bright two-note sparkle that rides the confetti
 *    burst on a normal session completion.
 *
 * The AudioContext is created lazily and resumed on first use — both sounds fire
 * right after a user gesture (rating cards), so autoplay policy is satisfied. In
 * environments without Web Audio (e.g. jsdom in tests) every call is a no-op.
 *
 * Callers gate on the `celebrationSound` setting; these functions don't read it.
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) {
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** One plucked note: fast attack, exponential decay (a soft mallet/bell). */
function note(
  ac: AudioContext,
  freq: number,
  startAt: number,
  duration: number,
  peak: number,
): void {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.03);
}

/** Level-up / achievement chime: a quick ascending major arpeggio. */
export function playCelebration(): void {
  const ac = getCtx();
  if (!ac) return;
  const t0 = ac.currentTime + 0.01;
  // C5, E5, G5, C6 — a bright, resolved major chord rolled upward.
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((f, i) => note(ac, f, t0 + i * 0.075, 0.3, 0.18));
}

/** Confetti pop: a short, high two-note sparkle. */
export function playConfetti(): void {
  const ac = getCtx();
  if (!ac) return;
  const t0 = ac.currentTime + 0.01;
  // E6, G6 — quick and light, distinct from the celebration arpeggio.
  [1318.51, 1567.98].forEach((f, i) => note(ac, f, t0 + i * 0.05, 0.14, 0.14));
}
