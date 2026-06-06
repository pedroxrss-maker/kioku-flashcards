import type { Algorithm } from '../../db/types';

const LABEL: Record<Algorithm, string> = { fsrs: 'FSRS', sm2: 'SM-2' };

/** Small, discreet pill showing a deck's scheduling algorithm. */
export function AlgoBadge({
  algorithm,
  className,
}: {
  algorithm: Algorithm;
  className?: string;
}) {
  return (
    <span className={className ? `pill-algo ${className}` : 'pill-algo'}>
      {LABEL[algorithm]}
    </span>
  );
}
