/**
 * Kioku forces animations ON for every user.
 *
 * Product decision: the OS/browser "prefers-reduced-motion: reduce" setting must
 * NOT suppress Kioku's animations. Some machines had reduced motion enabled and
 * silently lost every landing/in-app animation, so we deliberately override the
 * preference and always play them.
 *
 * This shadows framer-motion's `useReducedMotion`, which reads the media query
 * directly (and ignores `<MotionConfig reducedMotion="never">`). Every gate of
 * the form `reduce ? <static> : <animated>` therefore always takes the animated
 * branch. To restore OS-respecting behavior, re-export framer-motion's hook from
 * here instead.
 */
export function useReducedMotion(): boolean {
  return false;
}
